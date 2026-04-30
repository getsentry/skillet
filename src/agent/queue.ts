/**
 * Process-wide AI job queue.
 *
 * Every LLM-bound call in skillet submits a job here. The queue
 * bounds concurrency, retries transient failures, enforces a
 * per-job wall-clock timeout via AbortSignal, and emits lifecycle
 * events for end-of-command telemetry.
 */

export interface AiJob<T> {
  /** Telemetry/clustering name. Convention: "phase:identifier",
   *  e.g. "eval-case:flag-n-plus-one__loop", "eval-gen:flag-n-plus-one",
   *  "spec-author:turn-3", "judge:case-id". */
  name: string;
  /** The actual work. Receives an AbortSignal from the queue's
   *  timeout / cancellation logic — pass it into pi-ai's `complete`. */
  run: (signal: AbortSignal) => Promise<T>;
}

export interface QueueConfig {
  concurrency: number;
  maxRetries: number;
  timeoutMs: number;
  baseBackoffMs: number;
  maxBackoffMs: number;
}

export type JobEvent =
  | { kind: "queued"; name: string; depth: number }
  | { kind: "started"; name: string; attempt: number }
  | { kind: "retrying"; name: string; attempt: number; reason: string; delayMs: number }
  | { kind: "succeeded"; name: string; attempt: number; durationMs: number }
  | { kind: "failed"; name: string; attempts: number; reason: string };

const DEFAULT_CONFIG: QueueConfig = {
  concurrency: 4,
  maxRetries: 3,
  timeoutMs: 4 * 60_000,
  baseBackoffMs: 2_000,
  maxBackoffMs: 60_000,
};

let config: QueueConfig = { ...DEFAULT_CONFIG };

let inFlight = 0;
let waiting = 0;
const waiters: Array<() => void> = [];
const handlers = new Set<(e: JobEvent) => void>();

export const getQueueConfig = (): QueueConfig => ({ ...config });

export const setQueueConfig = (next: Partial<QueueConfig>): void => {
  config = { ...config, ...next };
};

export const onJobEvent = (handler: (e: JobEvent) => void): (() => void) => {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
};

const emit = (event: JobEvent): void => {
  for (const h of handlers) {
    try {
      h(event);
    } catch {
      // Telemetry must never break the queue.
    }
  }
};

const acquire = (): Promise<void> => {
  if (inFlight < config.concurrency) {
    inFlight++;
    return Promise.resolve();
  }
  waiting++;
  return new Promise<void>((resolve) => {
    waiters.push(() => {
      inFlight++;
      waiting--;
      resolve();
    });
  });
};

const release = (): void => {
  inFlight--;
  const next = waiters.shift();
  if (next != null) next();
};

// ── Transient-error classifier ─────────────────────────────

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
    // mid-stream / connection-failure markers — see commit history
    // for a real-world incident where these slipped past retry
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
  if (e.name === "AbortError") return true; // timeout — retryable
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

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const jitter = (ms: number): number => Math.round(ms * (0.75 + Math.random() * 0.5));

const backoffMs = (attempt: number): number => {
  const raw = Math.min(config.baseBackoffMs * 2 ** attempt, config.maxBackoffMs);
  return jitter(raw);
};

// ── Submission ─────────────────────────────────────────────

interface ResponseLike {
  stopReason?: unknown;
  errorMessage?: unknown;
}

const isTransientResult = (result: unknown): { transient: true; reason: string } | null => {
  if (result == null || typeof result !== "object") return null;
  const r = result as ResponseLike;
  if (r.stopReason !== "error") return null;
  const msg = typeof r.errorMessage === "string" ? r.errorMessage : "provider error";
  if (isTransientMessage(msg)) return { transient: true, reason: msg };
  return null;
};

/**
 * Submit a job. Resolves with the run() result, or rejects after
 * `maxRetries + 1` attempts (or immediately on a non-transient
 * error). The job's `run` receives an AbortSignal that fires after
 * `timeoutMs`.
 */
export const submitAiJob = async <T>(job: AiJob<T>): Promise<T> => {
  emit({ kind: "queued", name: job.name, depth: waiting });
  await acquire();

  let lastError: string = "unknown error";
  let attempt = 0;
  try {
    while (true) {
      attempt++;
      emit({ kind: "started", name: job.name, attempt });

      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => {
        controller.abort();
      }, config.timeoutMs);

      const startedAt = Date.now();
      try {
        const result = await job.run(controller.signal);
        clearTimeout(timeoutHandle);
        const transientResult = isTransientResult(result);
        if (transientResult != null && attempt <= config.maxRetries) {
          const delayMs = backoffMs(attempt - 1);
          emit({
            kind: "retrying",
            name: job.name,
            attempt,
            reason: transientResult.reason,
            delayMs,
          });
          lastError = transientResult.reason;
          await sleep(delayMs);
          continue;
        }
        emit({
          kind: "succeeded",
          name: job.name,
          attempt,
          durationMs: Date.now() - startedAt,
        });
        return result;
      } catch (err: unknown) {
        clearTimeout(timeoutHandle);
        const reason = err instanceof Error ? err.message : String(err);
        if (isTransientException(err) && attempt <= config.maxRetries) {
          const delayMs = backoffMs(attempt - 1);
          emit({ kind: "retrying", name: job.name, attempt, reason, delayMs });
          lastError = reason;
          await sleep(delayMs);
          continue;
        }
        emit({ kind: "failed", name: job.name, attempts: attempt, reason });
        throw err;
      }
    }
  } finally {
    release();
  }

  // Unreachable — the loop either returns or throws.
  throw new Error(`AI job '${job.name}' exhausted retries: ${lastError}`);
};

/**
 * Wait for all in-flight and queued jobs to settle. Useful before
 * printing an end-of-command summary so late events aren't dropped.
 */
export const drainQueue = async (): Promise<void> => {
  // The counters are mutated only by other async code (acquire/release).
  // ESLint's no-unmodified-loop-condition can't see that, so we poll
  // explicitly. 50ms is short enough for snappy CLI exit, long enough
  // not to spin.
  // oxlint-disable-next-line eslint/no-unmodified-loop-condition
  while (inFlight > 0 || waiting > 0) {
    await sleep(50);
  }
};
