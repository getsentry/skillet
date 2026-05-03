/**
 * Skillet skill as a pi-ai agent for upstream
 * `@vitest-evals/harness-pi-ai`'s `piAiHarness`.
 *
 * Generated eval files do:
 *
 *   describeEval("foo", {
 *     harness: piAiHarness({ agent: skilletAgent({ skillRoot }) }),
 *   }, (it) => { ... });
 *
 * `skilletAgent({ skillRoot })` returns an object with both:
 * - `run(input, runtime)` — drives the LLM-call-with-tools
 *   loop on top of pi-ai, dispatching tool calls through
 *   `runtime.tools.<name>(args)`.
 * - `tools` — the agent's `PiAiToolset`. `piAiHarness`
 *   auto-detects this off the agent and wires it into the
 *   runtime, so the eval file doesn't pass `tools` separately.
 */

import type { Context } from "@mariozechner/pi-ai";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { PiAiRuntime, PiAiToolset } from "@vitest-evals/harness-pi-ai";
import { resolveModels } from "../agent/provider.js";
import { submitAiJob } from "../agent/queue.js";
import { runToolLoop } from "../agent/tool-loop.js";
import { createToolDefs } from "../agent/tools.js";
import { loadSkill, type Skill } from "../skill/loader.js";
import { skilletTools } from "./skillet-tools.js";

/**
 * Env var that overrides which skill the agent loads. Set by
 * `skillet eval <a> --against <b>` so case data from skill A
 * runs against skill B's SKILL.md.
 */
export const COMPARE_SKILL_ENV = "SKILLET_COMPARE_SKILL";

export interface SkilletAgentOptions {
  /** Path to the skill directory (containing SKILL.md). */
  skillRoot: string;
  /** Per-case wall-clock cap in ms. Default: 180_000. */
  timeoutMs?: number;
}

export interface SkilletAgent {
  /** Skill root the agent runs against. */
  readonly skillRoot: string;
  /**
   * Tool definitions exposed to the agent. `piAiHarness`
   * auto-detects this field off the agent and wires the toolset
   * into the runtime; eval files don't pass `tools` separately.
   */
  readonly tools: PiAiToolset;
  /**
   * Drive the LLM loop for a single user input. Returns
   * `{ output, usage }`; `piAiHarness` consumes both into the
   * normalized `HarnessRun`.
   */
  run: (
    input: string,
    runtime: PiAiRuntime<PiAiToolset>,
  ) => Promise<{ output: string; usage: { totalTokens?: number; toolCalls: number } }>;
}

const DEFAULT_TIMEOUT_MS = 180_000;
const MAX_TOOL_CALLS_PER_TURN = 50;

const stringify = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
};

/**
 * Build a `SkilletAgent` bound to a skill root. The skill is
 * loaded lazily on each `run` so `SKILLET_COMPARE_SKILL` overrides
 * take effect per test.
 */
export const skilletAgent = (opts: SkilletAgentOptions): SkilletAgent => {
  const override = process.env[COMPARE_SKILL_ENV];
  const skillPath = override != null && override !== "" ? override : opts.skillRoot;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    skillRoot: skillPath,
    tools: skilletTools({ skillRoot: skillPath }),
    run: async (input, runtime) => {
      const skill = loadSkill(skillPath);
      const model = resolveModels().agent;
      const tools = createToolDefs();
      const systemPrompt = buildSystemPrompt(skill);

      const context: Context = {
        systemPrompt,
        messages: [
          {
            role: "user",
            content: input,
            timestamp: Date.now(),
          },
        ],
        tools,
      };

      const deadline = Date.now() + timeoutMs;
      const result = await submitAiJob({
        name: `eval-case:${skill.meta.name}`,
        timeoutMs,
        run: (signal) =>
          runToolLoop({
            model,
            context,
            executeTool: async (name, args) => {
              const dispatch = runtime.tools[name];
              if (typeof dispatch !== "function") {
                return `Error: unknown tool "${name}"`;
              }
              // Upstream's runtime.tools<TTool> dispatcher is typed as
              // taking ToolArgs<TTool> (Record<string, JsonValue>) and
              // returning Promise<ToolResult<TTool>>. validateToolCall
              // already JSON-shaped the args; cast via unknown so the
              // safer assertion lint accepts the transition.
              // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
              const out = await (
                dispatch as unknown as (a: Record<string, unknown>) => Promise<unknown>
              )(args);
              return stringify(out);
            },
            deadline,
            maxToolCalls: MAX_TOOL_CALLS_PER_TURN,
            signal,
          }),
      });

      if (result.allText !== "") {
        runtime.events.assistant(result.allText);
      }

      return {
        output: result.allText,
        usage: { toolCalls: result.toolCallCount },
      };
    },
  };
};

const buildSystemPrompt = (skill: Skill): string => {
  const references = listSkillReferences(skill.root);
  const referenceText =
    references.length > 0
      ? `\nSkill reference files are available through the read_file/list_files/grep tools. They are skill resources, not workspace files. If the skill instructions say a reference applies, your first action should be a read_file tool call for that exact relative path. Saying you will consult a reference is not enough; the reference is only loaded when you call read_file. Do not claim no references were shipped.\n${references
          .map((path) => `- ${path}`)
          .join("\n")}\n`
      : "";

  return `You are an AI coding agent executing a task in a workspace.

Skill root: ${skill.root}
${referenceText}

Your behavior is guided by the following skill instructions. Follow them precisely.

---

${skill.body}`;
};

const listSkillReferences = (skillRoot: string): string[] => {
  const referencesDir = join(skillRoot, "references");
  if (!existsSync(referencesDir)) return [];
  try {
    return (
      readdirSync(referencesDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => `references/${entry.name}`)
        .filter((path) => {
          try {
            return statSync(join(skillRoot, path)).isFile();
          } catch {
            return false;
          }
        })
        // oxlint-disable-next-line unicorn/no-array-sort
        .sort()
    );
  } catch {
    return [];
  }
};
