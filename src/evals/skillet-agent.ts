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
 * Implementation: thin wrapper around upstream `pi-agent-core`'s
 * `runAgentLoop`. We bring three skillet-specific things to the
 * table — load the skill (Anthropic Agent Skills format → system
 * prompt), expose our agent's tools, and bridge tool dispatch to
 * `piAiHarness`'s runtime so upstream's session/toolCalls
 * tracking fires. Everything else (LLM calls, retries, tool
 * loop, message normalization) belongs to the upstream loop.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Message } from "@mariozechner/pi-ai";
import { runAgentLoop, type AgentEvent, type AgentTool } from "@mariozechner/pi-agent-core";
import type { PiAiRuntime, PiAiToolset } from "@vitest-evals/harness-pi-ai";
import type { JsonValue } from "vitest-evals";
import { resolveModels } from "../agent/provider.js";
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
  ) => Promise<{ output: string; usage: { toolCalls: number } }>;
}

const DEFAULT_TIMEOUT_MS = 180_000;

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
  const tools = skilletTools({ skillRoot: skillPath });

  return {
    skillRoot: skillPath,
    tools,
    run: async (input, runtime) => {
      const skill = loadSkill(skillPath);
      const model = resolveModels().agent;
      const systemPrompt = buildSystemPrompt(skill);

      // Bridge: each pi-ai Tool schema (createToolDefs) becomes
      // an AgentTool whose execute delegates to runtime.tools so
      // piAiHarness tracks the call on result.session.toolCalls.
      const agentTools: AgentTool[] = createToolDefs().map((piTool) => ({
        ...piTool,
        label: piTool.name,
        execute: async (_toolCallId, params) => {
          const dispatch = runtime.tools[piTool.name];
          if (typeof dispatch !== "function") {
            throw new Error(`unknown tool "${piTool.name}"`);
          }
          // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
          const out = await (dispatch as (a: Record<string, unknown>) => Promise<unknown>)(
            // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
            params as Record<string, unknown>,
          );
          return {
            content: [{ type: "text", text: stringify(out) }],
            // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
            details: out as JsonValue,
          };
        },
      }));

      // Vitest's per-test timeout already caps the run; we add an
      // AbortSignal so a stuck LLM call cancels at our deadline.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const allText: string[] = [];
      let toolCallCount = 0;

      try {
        await runAgentLoop(
          [{ role: "user", content: input, timestamp: Date.now() }],
          {
            systemPrompt,
            messages: [],
            tools: agentTools,
          },
          {
            model,
            // We don't introduce custom AgentMessage types; the
            // identity passthrough satisfies the contract.
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            convertToLlm: (msgs) => msgs as Message[],
          },
          (event: AgentEvent) => {
            if (event.type === "message_end" && event.message.role === "assistant") {
              const text = assistantText(event.message);
              if (text !== "") {
                runtime.events.assistant(text);
                allText.push(text);
              }
              toolCallCount += countToolCalls(event.message);
            }
          },
          controller.signal,
        );
      } finally {
        clearTimeout(timer);
      }

      return {
        output: allText.join("\n\n"),
        usage: { toolCalls: toolCallCount },
      };
    },
  };
};

const assistantText = (message: Message): string => {
  if (message.role !== "assistant") return "";
  const blocks = Array.isArray(message.content) ? message.content : [];
  return blocks
    .filter((b): b is { type: "text"; text: string } => {
      return typeof b === "object" && b != null && (b as { type?: unknown }).type === "text";
    })
    .map((b) => b.text)
    .join("");
};

const countToolCalls = (message: Message): number => {
  if (message.role !== "assistant") return 0;
  const blocks = Array.isArray(message.content) ? message.content : [];
  return blocks.filter((b) => {
    return typeof b === "object" && b != null && (b as { type?: unknown }).type === "toolCall";
  }).length;
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
