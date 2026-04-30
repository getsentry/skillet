import type { Context, Message } from "@mariozechner/pi-ai";
import { completeWithBackoff } from "../../agent/complete-with-backoff.js";
import type { AnyModel } from "../../agent/provider.js";
import { submitAiJob } from "../../agent/queue.js";
import { event } from "../../log.js";
import { saveFailedOutput } from "./_diagnostics.js";
import { extractText, stripFences } from "./_text.js";

const DEFAULT_MAX_RETRIES = 2;

export interface JsonPhaseOptions<T> {
  model: AnyModel;
  /** Phase framing/rules. */
  systemPrompt: string;
  /** First user-turn content — the actual input the phase operates on. */
  userMessage: string;
  /** Used in error messages (`seed-from-description`, `seed-from-skill`, ...). */
  phaseName: string;
  /**
   * Parse the raw LLM text into the desired output, throwing an
   * Error with a useful message on failure. The error message is
   * fed back to the LLM verbatim on retry.
   */
  parseAndValidate: (raw: string) => T;
  /** Defaults to 2 (i.e. 3 attempts total). */
  maxRetries?: number;
}

/**
 * Run a JSON-output LLM phase with self-correcting retries.
 *
 * On parse / validation failure, the assistant response and the
 * parser's error message are pushed back as the next user turn so
 * the LLM can fix the specific malformation. After
 * `maxRetries + 1` attempts the function throws with the last raw
 * output attached for diagnostics.
 *
 * Output fences (```json ... ```) are stripped automatically before
 * `parseAndValidate` sees the text.
 */
export const runJsonPhaseWithRetries = <T>(opts: JsonPhaseOptions<T>): Promise<T> => {
  return submitAiJob({
    name: opts.phaseName,
    run: (signal) => runJsonPhaseWithRetriesInner(opts, signal),
  });
};

const runJsonPhaseWithRetriesInner = async <T>(
  opts: JsonPhaseOptions<T>,
  signal: AbortSignal,
): Promise<T> => {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const messages: Message[] = [{ role: "user", content: opts.userMessage, timestamp: Date.now() }];

  let lastRaw = "";
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const context: Context = { systemPrompt: opts.systemPrompt, messages };
    const response = await completeWithBackoff(opts.model, context, { signal });
    if (response.stopReason === "error") {
      const errMsg = response.errorMessage ?? "unknown error";
      throw new Error(`${opts.phaseName}: LLM returned error: ${errMsg}`);
    }

    lastRaw = stripFences(extractText(response), "json");
    try {
      return opts.parseAndValidate(lastRaw);
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const remaining = maxRetries - attempt;
      const kind = lastError.message.toLowerCase().includes("json") ? "parse" : "schema";
      const saved = saveFailedOutput({
        phase: opts.phaseName,
        key: "turn",
        attempt: attempt + 1,
        raw: lastRaw,
        errorMessage: lastError.message,
        kind,
      });
      event("warn", `${opts.phaseName} attempt=${attempt + 1} ${kind}-fail`, {
        message: lastError.message,
        retriesRemaining: remaining,
        savedTo: saved.path,
        responseHead: saved.excerpt,
      });
      if (attempt >= maxRetries) break;

      messages.push(response);
      messages.push({
        role: "user",
        content: `Your previous output failed to parse:\n\n${lastError.message}\n\nRegenerate the JSON object with the issue fixed. Output ONLY the JSON, starting with \`{\`.`,
        timestamp: Date.now(),
      });
    }
  }

  throw new Error(
    `${opts.phaseName}: failed to produce valid output after ${maxRetries + 1} attempts: ${
      lastError?.message ?? "unknown error"
    }\n\nLast raw LLM output:\n${lastRaw}`,
    lastError != null ? { cause: lastError } : undefined,
  );
};
