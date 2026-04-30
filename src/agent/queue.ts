/**
 * Process-wide AI job queue.
 *
 * Operates at the **phase / job** granularity, not per-LLM-call. A
 * "job" is one logical operation that may make multiple `complete()`
 * calls internally — e.g. one eval-gen for a behavior (with parse
 * retry), one eval case (with multi-turn agent + tool calls), one
 * author turn. The queue:
 *
 *  - Bounds concurrency to a configurable max (slot per job).
 *  - Enforces a per-job wall-clock deadline via `AbortSignal`. The
 *    job's `run` callback receives the signal and is expected to
 *    forward it into every pi-ai `complete()` call so a stuck HTTP
 *    request actually cancels.
 *  - Emits lifecycle events for end-of-command telemetry.
 *
 * Per-LLM-call transient retry lives in `complete-with-backoff.ts` —
 * not here. The queue does NOT retry jobs on its own; a job that
 * throws bubbles up to the caller. This avoids the compounding bug
 * where a phase's parse-retry loop and a queue-level transient retry
 * multiplied each other.
 */

export interface AiJob<T> {
  /** Telemetry/clustering name. Convention: "phase:identifier",
   *  e.g. "eval-case:flag-n-plus-one__loop", "eval-gen:flag-n-plus-one",
   *  "spec-author:turn-3", "judge:case-id". */
  name: string;
  /** The actual work. Receives an AbortSignal that fires when the
   *  per-job deadline expires. Forward the signal into every pi-ai
   *  `complete()` call inside. */
  run: (signal: AbortSignal) => Promise<T>;
  /** Per-job timeout override (ms). Defaults to queue config's
   *  `timeoutMs`. */
  timeoutMs?: number;
}

export interface QueueConfig {
  concurrency: number;
  /** Default wall-clock deadline per job (ms). Phases that want a
   *  tighter or looser cap pass `timeoutMs` on the job. */
  timeoutMs: number;
}

export type JobEvent =
  | { kind: "queued"; name: string; depth: number }
  | { kind: "started"; name: string }
  | { kind: "succeeded"; name: string; durationMs: number }
  | { kind: "failed"; name: string; reason: string };

const DEFAULT_CONFIG: QueueConfig = {
  concurrency: 4,
  timeoutMs: 10 * 60_000,
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

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Submit a job. Acquires a slot, sets up a per-job deadline (signal
 * fires at `timeoutMs`), runs the job, releases the slot, and emits
 * telemetry. Errors propagate to the caller — the queue never
 * retries.
 */
export const submitAiJob = async <T>(job: AiJob<T>): Promise<T> => {
  emit({ kind: "queued", name: job.name, depth: waiting });
  await acquire();

  const timeoutMs = job.timeoutMs ?? config.timeoutMs;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  emit({ kind: "started", name: job.name });
  const startedAt = Date.now();

  try {
    const result = await job.run(controller.signal);
    emit({ kind: "succeeded", name: job.name, durationMs: Date.now() - startedAt });
    return result;
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    emit({ kind: "failed", name: job.name, reason });
    throw err;
  } finally {
    clearTimeout(timeoutHandle);
    release();
  }
};

/**
 * Wait for all in-flight and queued jobs to settle. Useful before
 * printing an end-of-command summary so late events aren't dropped.
 */
export const drainQueue = async (): Promise<void> => {
  // Counters mutate via other async paths; ESLint can't see it.
  // oxlint-disable-next-line eslint/no-unmodified-loop-condition
  while (inFlight > 0 || waiting > 0) {
    await sleep(50);
  }
};
