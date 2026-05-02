/**
 * Reusable LLM ↔ tool inner loop. Mutates `context.messages` in-place
 * with assistant + tool-result messages and returns the final text,
 * tool-call count, and a normalized transcript additions list for
 * callers that maintain their own transcript.
 */

import type { Context, Message } from "@mariozechner/pi-ai";
import { validateToolCall } from "@mariozechner/pi-ai";
import type { JsonValue, NormalizedMessage, ToolCallRecord } from "../vitest-evals/types.js";
import { completeWithBackoff } from "./complete-with-backoff.js";
import type { AnyModel } from "./provider.js";

const isRecord = (v: unknown): v is Record<string, unknown> => {
  return v != null && typeof v === "object" && !Array.isArray(v);
};

const DEFAULT_PER_STEP_CAP_MS = 4 * 60_000; // 4 minutes

export interface ToolLoopOptions {
  model: AnyModel;
  /**
   * Pre-built context with `systemPrompt`, `messages`, and `tools`. The
   * kernel appends assistant + tool-result messages to `messages` as
   * the loop runs.
   */
  context: Context;
  /**
   * Validated executor for tool calls. The kernel narrows the
   * `arguments` field via pi-ai's `validateToolCall` against the
   * tools declared on `context.tools` and hands the result here.
   * Returns the text payload the model will see.
   */
  executeTool: (name: string, args: Record<string, unknown>) => string;
  /**
   * Wall-clock deadline (ms epoch). The kernel throws on overrun before
   * each LLM call.
   */
  deadline: number;
  /**
   * Hard cap on tool invocations within this kernel call. When the next
   * model response would exceed the cap, the kernel returns
   * `endReason: "max-tool-calls"` *without executing* the over-budget
   * tool calls — the caller decides how to nudge the model toward
   * terminal output.
   */
  maxToolCalls: number;
  /** Optional per-LLM-call timeout (default: 4 minutes). */
  perStepCapMs?: number;
  /** Called on each tool execution for visibility. */
  onToolCall?: (name: string, step: number) => void;
  /**
   * Outer abort signal from the AI queue's per-job deadline.
   * Forwarded into every pi-ai `complete()` call so a stuck HTTP
   * request cancels cleanly when the job's wall-clock deadline fires.
   */
  signal?: AbortSignal;
}

export interface ToolLoopResult {
  /**
   * Text from the final (non-toolUse) assistant response. Empty when
   * the loop ended on `max-tool-calls` before the model produced
   * terminal text.
   */
  finalText: string;
  /** Concatenated text from every assistant response in the loop. */
  allText: string;
  /** Number of tool calls executed (does not include rejected calls). */
  toolCallCount: number;
  /**
   * Normalized assistant + tool messages added to the transcript.
   * Callers that maintain a separate transcript append these in order;
   * callers that don't can ignore the field.
   */
  transcriptAdditions: NormalizedMessage[];
  /**
   * - `stop` / `length` — natural model termination.
   * - `max-tool-calls` — kernel returned because executing the next
   *   batch of tool calls would have exceeded `maxToolCalls`. The
   *   model's tool-call response is in `messages` but unexecuted.
   * - `error` — pi-ai returned `stopReason: "error"`; `errorMessage`
   *   is set.
   */
  endReason: "stop" | "length" | "max-tool-calls" | "error";
  errorMessage?: string;
}

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

const timeoutPromise = (ms: number): Promise<never> => {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`LLM call timed out after ${ms}ms`));
    }, ms);
  });
};

export const runToolLoop = async (opts: ToolLoopOptions): Promise<ToolLoopResult> => {
  const { model, context, executeTool, deadline, maxToolCalls, onToolCall, signal } = opts;
  const perStepCapMs = opts.perStepCapMs ?? DEFAULT_PER_STEP_CAP_MS;
  const tools = context.tools ?? [];

  const transcriptAdditions: NormalizedMessage[] = [];
  const allTextParts: string[] = [];
  let finalText = "";
  let toolCallCount = 0;
  let step = 0;

  while (true) {
    step++;

    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(`tool-loop: deadline exceeded at step ${step}`);
    }

    const perStepCap = Math.min(remaining, perStepCapMs);

    const response = await Promise.race([
      completeWithBackoff(model, context, signal != null ? { signal } : undefined),
      timeoutPromise(perStepCap),
    ]);

    context.messages.push(response);

    // Collect text from this response
    const textParts = response.content
      .filter((b): b is { type: "text"; text: string; textSignature?: string } => b.type === "text")
      .map((b) => b.text);
    const assistantText = textParts.join("");
    if (textParts.length > 0) allTextParts.push(assistantText);

    const toolCalls = response.content.filter((b) => b.type === "toolCall");
    const normalizedToolCalls = toolCalls
      .map((block) => normalizeToolCall(block))
      .filter((block): block is ToolCallRecord => block != null);

    const transcriptEntry: NormalizedMessage = { role: "assistant", content: assistantText };
    if (normalizedToolCalls.length > 0) {
      transcriptEntry.toolCalls = normalizedToolCalls;
    }
    transcriptAdditions.push(transcriptEntry);

    // Error / natural termination
    if (response.stopReason === "error") {
      return {
        finalText: assistantText,
        allText: allTextParts.join("\n\n"),
        toolCallCount,
        transcriptAdditions,
        endReason: "error",
        errorMessage: response.errorMessage ?? "unknown error",
      };
    }
    if (toolCalls.length === 0 || response.stopReason !== "toolUse") {
      finalText = assistantText;
      return {
        finalText,
        allText: allTextParts.join("\n\n"),
        toolCallCount,
        transcriptAdditions,
        endReason: response.stopReason === "length" ? "length" : "stop",
      };
    }

    // Budget gate — return without executing if this batch would
    // exceed the cap. Caller can nudge and call again with the
    // unfinished tool-call response already in `messages`.
    if (toolCallCount + toolCalls.length > maxToolCalls) {
      return {
        finalText: "",
        allText: allTextParts.join("\n\n"),
        toolCallCount,
        transcriptAdditions,
        endReason: "max-tool-calls",
      };
    }

    // Execute each tool call and feed results back
    let normalizedIndex = 0;
    for (const block of toolCalls) {
      if (block.type !== "toolCall") continue;
      toolCallCount++;
      onToolCall?.(block.name, step);

      let resultText: string;
      let isError = false;
      try {
        const validated: unknown = validateToolCall(tools, block);
        const args: Record<string, unknown> = isRecord(validated) ? validated : {};
        resultText = executeTool(block.name, args);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
        resultText = `Error: ${message}`;
        isError = true;
      }

      const toolResult: Message = {
        role: "toolResult",
        toolCallId: block.id,
        toolName: block.name,
        content: [{ type: "text", text: resultText }],
        isError,
        timestamp: Date.now(),
      };
      context.messages.push(toolResult);
      transcriptAdditions.push({
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
};
