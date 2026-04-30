import { complete } from "@mariozechner/pi-ai";
import type { AssistantMessage, Context } from "@mariozechner/pi-ai";
import type { AnyModel } from "./provider.js";

/**
 * Backoff schedule (ms) for transient upstream errors. 5 attempts,
 * ~100s total worst case. Jitter ±25% is applied per delay. The retry
 * is per-call here so a single network blip doesn't escape; the AI
 * job queue (`src/agent/queue.ts`) operates on whole phases (one
 * eval case, one eval-gen per behavior, one author turn) — it is
 * the throttle and budget, not a retry layer.
 */
const BACKOFF_MS = [2_000, 5_000, 12_000, 30_000, 60_000];

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const jitter = (ms: number): number => Math.round(ms * (0.75 + Math.random() * 0.5));

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
    m.includes("temporarily unavailable") ||
    m.includes("terminated") ||
    m.includes("premature close") ||
    m.includes("socket hang up") ||
    m.includes("connection closed") ||
    m.includes("connection reset") ||
    m.includes("network error") ||
    m.includes("stream interrupted") ||
    m.includes("incomplete response") ||
    m.includes("aborted") ||
    m.includes("econnreset")
  );
};

const isTransientException = (err: unknown): boolean => {
  if (err == null || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string; name?: string };
  // AbortError thrown by a phase's deadline signal: NOT transient
  // for retry purposes — the phase wants to surface the abort.
  if (e.name === "AbortError") return false;
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
 * Wrap pi-ai's `complete` with per-call exponential backoff for
 * transient upstream errors (429, 5xx, network glitches). Single
 * source of retry truth. Phases that want to retry on parse failure
 * or schema mismatch handle that themselves at the dialogue level —
 * CWB's job is just "make sure a transient blip doesn't kill us."
 *
 * The optional `signal` is forwarded into pi-ai so a phase-level
 * deadline can abort the underlying HTTP call cleanly.
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
