import { complete } from "@mariozechner/pi-ai";
import type { AssistantMessage, Context } from "@mariozechner/pi-ai";
import type { AnyModel } from "./provider.js";

/**
 * Backoff schedule (ms) for transient upstream errors. 5 attempts,
 * ~100s total worst case. Jitter ±25% is applied per delay.
 */
const BACKOFF_MS = [2_000, 5_000, 12_000, 30_000, 60_000];

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const jitter = (ms: number): number => Math.round(ms * (0.75 + Math.random() * 0.5));

/**
 * Detect transient upstream errors worth retrying. Covers HTTP 429
 * rate-limit, 529 overloaded (Anthropic), 503/504, generic "overloaded"
 * messages, and timeout-style strings.
 */
const isTransientMessage = (message: string | undefined): boolean => {
  if (message == null) return false;
  const m = message.toLowerCase();
  return (
    m.includes("overloaded") ||
    m.includes("rate_limit") ||
    m.includes("rate limit") ||
    m.includes("too many requests") ||
    m.includes("429") ||
    m.includes("503") ||
    m.includes("504") ||
    m.includes("529") ||
    m.includes("timeout") ||
    m.includes("temporarily unavailable")
  );
};

const isTransientException = (err: unknown): boolean => {
  if (err == null || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (e.code != null) {
    const transientCodes = new Set([
      "ETIMEDOUT",
      "ECONNRESET",
      "ECONNREFUSED",
      "ENETUNREACH",
      "EAI_AGAIN",
      "EPIPE",
    ]);
    if (transientCodes.has(e.code)) return true;
  }
  return isTransientMessage(e.message);
};

/**
 * Wrap pi-ai's `complete` with exponential backoff for transient
 * upstream errors (429, 529, 503/504, network glitches). pi-ai
 * already honors `Retry-After` headers up to `maxRetryDelayMs`; this
 * handles the cases where the provider returns an overloaded/error
 * response without an actionable retry hint.
 */
export const completeWithBackoff = async (
  model: AnyModel,
  context: Context,
  options?: Parameters<typeof complete>[2],
): Promise<AssistantMessage> => {
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    try {
      const response = await complete(model, context, options);
      if (response.stopReason === "error" && isTransientMessage(response.errorMessage)) {
        lastError = response.errorMessage ?? "provider error";
        if (attempt < BACKOFF_MS.length) {
          const delay = jitter(BACKOFF_MS[attempt] ?? 60_000);
          process.stderr.write(
            `\x1b[2m    transient upstream error (${lastError.slice(0, 80)}), retrying in ${(delay / 1000).toFixed(1)}s\x1b[0m\n`,
          );
          await sleep(delay);
          continue;
        }
      }
      return response;
    } catch (err: unknown) {
      if (isTransientException(err) && attempt < BACKOFF_MS.length) {
        const msg = err instanceof Error ? err.message : String(err);
        lastError = msg;
        const delay = jitter(BACKOFF_MS[attempt] ?? 60_000);
        process.stderr.write(
          `\x1b[2m    transient network error (${msg.slice(0, 80)}), retrying in ${(delay / 1000).toFixed(1)}s\x1b[0m\n`,
        );
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }

  throw new Error(
    `Upstream model is unavailable after ${BACKOFF_MS.length} retries: ${lastError ?? "unknown error"}`,
  );
};
