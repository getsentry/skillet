import { validateToolCall } from "@mariozechner/pi-ai";
import type { Context } from "@mariozechner/pi-ai";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { completeWithBackoff } from "./complete-with-backoff.js";
import { createToolDefs, executeTool } from "./tools.js";
import type { AnyModel } from "./provider.js";
import type { Skill } from "../skill/loader.js";
import type { JsonValue, NormalizedMessage, ToolCallRecord } from "../eval/index.js";

const isRecord = (v: unknown): v is Record<string, unknown> => {
  return v != null && typeof v === "object" && !Array.isArray(v);
};

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

const MAX_STEPS = 50;

const toJsonValue = (value: unknown): JsonValue | undefined => {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    const out: JsonValue[] = [];
    for (const item of value) {
      const converted = toJsonValue(item);
      if (converted !== undefined) out.push(converted);
    }
    return out;
  }
  if (isRecord(value)) {
    const out: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      const converted = toJsonValue(item);
      if (converted !== undefined) out[key] = converted;
    }
    return out;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "symbol") return value.description ?? "";
  return undefined;
};

const toolCallArgs = (block: Record<string, unknown>): Record<string, JsonValue> | undefined => {
  const raw = block.args ?? block.arguments ?? block.input;
  const converted = toJsonValue(raw);
  return isRecord(converted) ? converted : undefined;
};

const normalizeToolCall = (block: unknown): ToolCallRecord | null => {
  if (!isRecord(block)) return null;
  const name = block.name;
  if (typeof name !== "string" || name === "") return null;

  const record: ToolCallRecord = { name };
  if (typeof block.id === "string") record.id = block.id;
  const args = toolCallArgs(block);
  if (args != null) record.arguments = args;
  return record;
};

/**
 * Run the agent loop: send turns sequentially, handle tool calls,
 * collect text output.
 *
 * The `timeout` parameter is the deadline for the WHOLE case, not per
 * LLM call. The case-level deadline is enforced before each step;
 * exceeding it aborts the run with a clear timeout error. Without
 * this enforcement, a chatty agent could spend up to MAX_STEPS *
 * per-step-cap on a single case (the original bug — a 120s YAML
 * timeout was producing 5000s+ runs).
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

    // Run completion loop: call model, execute tools, repeat
    let steps = 0;
    while (steps < MAX_STEPS) {
      steps++;

      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(
          `Agent timed out after ${timeout}ms (case-level budget exhausted at step ${steps})`,
        );
      }

      // Per-step cap: bound a single hung LLM call. Use the smaller
      // of the remaining case budget and a generous per-step ceiling
      // (4 minutes — long enough for any single thoughtful turn,
      // short enough that a stuck call surfaces).
      const perStepCap = Math.min(remaining, 4 * 60_000);

      const response = await Promise.race([
        completeWithBackoff(model, context),
        timeoutPromise(perStepCap),
      ]);

      // Add assistant message to context
      context.messages.push(response);

      // Collect text output — narrow via type guard instead of `as` cast
      const textParts = response.content
        .filter(
          (b): b is { type: "text"; text: string; textSignature?: string } => b.type === "text",
        )
        .map((b) => b.text);
      const assistantText = textParts.join("");
      if (textParts.length > 0) {
        outputs.push(assistantText);
      }
      transcript.push({ role: "assistant", content: assistantText });

      // Check for tool calls
      const toolCalls = response.content.filter((b) => b.type === "toolCall");
      const normalizedToolCalls = toolCalls
        .map((block) => normalizeToolCall(block))
        .filter((block): block is ToolCallRecord => block != null);

      if (toolCalls.length === 0 || response.stopReason !== "toolUse") {
        if (normalizedToolCalls.length > 0 && transcript.length > 0) {
          const last = transcript[transcript.length - 1];
          if (last != null && last.role === "assistant") {
            last.toolCalls = normalizedToolCalls;
          }
        }
        break; // No tool calls, done with this turn
      }

      if (normalizedToolCalls.length > 0 && transcript.length > 0) {
        const last = transcript[transcript.length - 1];
        if (last != null && last.role === "assistant") {
          last.toolCalls = normalizedToolCalls;
        }
      }

      // Execute each tool call and add results to context
      let normalizedIndex = 0;
      for (const block of toolCalls) {
        if (block.type !== "toolCall") continue;
        totalToolCalls++;
        onToolCall?.(block.name, steps);

        let resultText: string;
        let isError = false;
        try {
          // validateToolCall is typed as `any` in pi-ai; wrap to a safe shape
          const validated: unknown = validateToolCall(tools, block);
          const args: Record<string, unknown> = isRecord(validated) ? validated : {};
          resultText = executeTool(workDir, block.name, args, skill.root);
        } catch (err: unknown) {
          const message =
            err instanceof Error
              ? err.message
              : typeof err === "string"
                ? err
                : JSON.stringify(err);
          resultText = `Error: ${message}`;
          isError = true;
        }

        context.messages.push({
          role: "toolResult",
          toolCallId: block.id,
          toolName: block.name,
          content: [{ type: "text", text: resultText }],
          isError,
          timestamp: Date.now(),
        });
        transcript.push({
          role: "tool",
          content: resultText,
          metadata: { name: block.name },
        });
        const normalized = normalizedToolCalls[normalizedIndex];
        normalizedIndex++;
        if (normalized != null) {
          normalized.result = resultText;
          if (isError) normalized.error = { message: resultText, type: "ToolError" };
        }
      }
    }
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

const timeoutPromise = (ms: number): Promise<never> => {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Agent timed out after ${ms}ms`));
    }, ms);
  });
};
