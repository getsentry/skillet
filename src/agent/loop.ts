import type { Context } from "@mariozechner/pi-ai";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { NormalizedMessage } from "../eval/index.js";
import type { Skill } from "../skill/loader.js";
import type { AnyModel } from "./provider.js";
import { runToolLoop } from "./tool-loop.js";
import { createToolDefs, executeTool } from "./tools.js";

export interface AgentRunOptions {
  model: AnyModel;
  skill: Skill;
  workDir: string;
  turns: string[];
  timeout: number;
  /** Called on each tool call for progress visibility */
  onToolCall?: (name: string, step: number) => void;
}

export interface AgentRunResult {
  /** Concatenated text output from all turns */
  output: string;
  /** Number of tool calls made across all turns */
  toolCallCount: number;
  /** Full conversation transcript as normalized messages */
  messages: NormalizedMessage[];
}

/** Per-turn cap on tool calls. When hit, the eval-runtime loop
 *  exits the inner cycle silently and proceeds to the next turn. */
const MAX_TOOL_CALLS_PER_TURN = 50;

/**
 * Run the eval-runtime agent loop: send turns sequentially through
 * the shared `runToolLoop` kernel, handle tool calls, collect output.
 *
 * The `timeout` parameter is the deadline for the WHOLE case, not per
 * LLM call. The case-level deadline is enforced inside the kernel
 * before each step; exceeding it aborts the run with a clear timeout
 * error. Per-step LLM calls have their own 4-minute cap inside the
 * kernel.
 */
export const runAgent = async (opts: AgentRunOptions): Promise<AgentRunResult> => {
  const { model, skill, workDir, turns, timeout, onToolCall } = opts;
  const tools = createToolDefs();

  const caseStart = Date.now();
  const deadline = caseStart + timeout;

  const systemPrompt = buildSystemPrompt(skill, workDir);
  const outputs: string[] = [];
  const transcript: NormalizedMessage[] = [];
  let totalToolCalls = 0;

  const context: Context = {
    systemPrompt,
    messages: [],
    tools,
  };

  for (const turn of turns) {
    context.messages.push({
      role: "user",
      content: turn,
      timestamp: Date.now(),
    });
    transcript.push({ role: "user", content: turn });

    const result = await runToolLoop({
      model,
      context,
      executeTool: (name, args) => executeTool(workDir, name, args, skill.root),
      deadline,
      maxToolCalls: MAX_TOOL_CALLS_PER_TURN,
      ...(onToolCall != null ? { onToolCall } : {}),
    });

    if (result.allText !== "") outputs.push(result.allText);
    transcript.push(...result.transcriptAdditions);
    totalToolCalls += result.toolCallCount;

    // `max-tool-calls` and `error` are absorbed silently — eval cases
    // continue against the existing context rather than aborting the run.
  }

  return {
    output: outputs.join("\n\n"),
    toolCallCount: totalToolCalls,
    messages: transcript,
  };
};

const buildSystemPrompt = (skill: Skill, workDir: string): string => {
  const references = listSkillReferences(skill.root);
  const referenceText =
    references.length > 0
      ? `\nSkill reference files are available through the read_file/list_files/grep tools. They are skill resources, not workspace files. If the skill instructions say a reference applies, your first action should be a read_file tool call for that exact relative path. Saying you will consult a reference is not enough; the reference is only loaded when you call read_file. Do not claim no references were shipped.\n${references
          .map((path) => `- ${path}`)
          .join("\n")}\n`
      : "";

  return `You are an AI coding agent executing a task in a workspace.

Working directory: ${workDir}
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
