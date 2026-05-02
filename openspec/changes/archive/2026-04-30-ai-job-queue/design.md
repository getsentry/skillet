# Design

## Queue API

```ts
// src/agent/queue.ts

export interface AiJob<T> {
  /** Telemetry/clustering name. Convention: "phase:identifier"
   *  e.g. "eval-case:flag-n-plus-one__loop", "eval-gen:flag-n-plus-one",
   *  "spec-author:turn-3", "judge:case-id". */
  name: string;
  /** The actual work. Receives an AbortSignal from the queue's
   *  timeout/cancellation logic. */
  run: (signal: AbortSignal) => Promise<T>;
}

export interface QueueConfig {
  /** Max concurrent jobs in flight. */
  concurrency: number;
  /** Max retry attempts (total attempts = retries + 1). */
  maxRetries: number;
  /** Per-job wall-clock timeout. */
  timeoutMs: number;
  /** Backoff base — first retry sleeps this long ± jitter. */
  baseBackoffMs: number;
  /** Backoff cap. */
  maxBackoffMs: number;
}

export type JobEvent =
  | { kind: "queued"; name: string; depth: number }
  | { kind: "started"; name: string; attempt: number }
  | { kind: "retrying"; name: string; attempt: number; reason: string; delayMs: number }
  | { kind: "succeeded"; name: string; attempt: number; durationMs: number }
  | { kind: "failed"; name: string; attempts: number; reason: string };

export const submitAiJob: <T>(job: AiJob<T>) => Promise<T>;
export const onJobEvent: (handler: (e: JobEvent) => void) => () => void;
export const getQueueConfig: () => QueueConfig;
export const setQueueConfig: (config: Partial<QueueConfig>) => void;
export const drainQueue: () => Promise<void>;  // wait for all in-flight to settle
```

## Defaults and config sources

```
concurrency:     SKILLET_AI_CONCURRENCY ?? --ai-concurrency=N ?? 4
maxRetries:      SKILLET_AI_RETRIES ?? 3
timeoutMs:       SKILLET_AI_TIMEOUT ?? 240_000  // 4 minutes
baseBackoffMs:   2_000
maxBackoffMs:    60_000
```

Queue config is set once at CLI startup from env + argv. The flag
parser strips `--ai-concurrency` before per-command argv reaches the
command.

## Retry classifier

Reuses the existing transient-message and transient-exception
detection from `complete-with-backoff.ts` (verbatim). Promoted to
`src/agent/queue.ts` since the classifier is now a queue-level
concern.

- Provider returns `stopReason: "error"` with transient message →
  retry.
- Caller throws transient exception (network, ECONNRESET, etc.) →
  retry.
- AbortError from timeout → retry (counts against attempts).
- Anything else → fail immediately, no retry.

Backoff: `min(baseBackoffMs * 2^attempt, maxBackoffMs)` ± 25% jitter.

## CWB rewrite

```ts
// src/agent/complete-with-backoff.ts (after)
import { complete } from "@mariozechner/pi-ai";
import { submitAiJob } from "./queue.js";

export const completeWithBackoff = async (
  model: AnyModel,
  context: Context,
  options?: Parameters<typeof complete>[2],
  jobName: string = "ai",
): Promise<AssistantMessage> => {
  return submitAiJob({
    name: jobName,
    run: (signal) => complete(model, context, { ...options, signal }),
  });
};
```

The whole transient-classifier and retry loop moves into the queue.
CWB shrinks from ~120 lines to ~10. Caller signatures unchanged
(name is optional positional, callers can opt-in for richer
telemetry).

## AbortSignal plumbing

pi-ai's `complete` accepts an `AbortSignal` via its options object.
The queue creates an `AbortController` per job, sets a `setTimeout`
to abort after `timeoutMs`, and clears the timeout on settle. CWB
forwards the signal into pi-ai's `complete`.

## Vitest interaction

Vitest workers run eval cases in parallel as today. Each case's
LLM calls submit to the queue and `await`. The queue's concurrency
becomes the real LLM throttle; vitest's worker pool size becomes
"how many cases can be *waiting* concurrently," which is fine.

A 16-case eval suite with `--ai-concurrency=4`: vitest spawns up to
N workers, each begins a case, all submit their first LLM call, the
queue admits 4 and the rest sit in the `queued` state until slots
free up. No double-throttling.

## Telemetry sink

End-of-command summary printer (in `src/cli.ts` after `main()`
returns). Subscribes to `onJobEvent` at startup, accumulates counts,
prints:

```
AI jobs: 73 succeeded, 4 retried, 2 failed
Failures clustered by name prefix:
  eval-case:* — 2 failed (case-id-1, case-id-2)
```

The compare command's special timeout reporting goes away — the
generic clustering covers it.

## Migration

CWB's signature change is additive (new optional last param). The 12
existing callers compile unchanged. Optional follow-up: thread
meaningful job names from key sites (eval cases, eval-gen,
reference-gen, spec-author).

`eval --concurrency` and `compare --concurrency` flags get
deprecated: parser still accepts them, prints "deprecated, use
`--ai-concurrency`", and applies the value to the queue config.
Removal in a future release.

## Risks

- **Retry interaction with caller-level retry.** `_retry.ts`
  (JSON-output retry harness) retries on parse failure — that's
  caller-thrown, not queue-classifier-retryable. Queue's classifier
  must NOT retry caller exceptions, only transient *infrastructure*
  exceptions. The existing `isTransientException` correctly only
  matches network/timeout — keep that boundary.
- **Stuck queue if a job hangs without timeout firing.** Mitigated
  by `timeoutMs` defaulting to 4 minutes. AbortSignal forwarding
  ensures pi-ai actually cancels the underlying HTTP.
- **Order-sensitive callers.** Spec-author runs sequential turns
  inside `runToolLoop`; those LLM calls can't go in parallel because
  each turn depends on the previous response. This already happens
  via `await` chains — the queue doesn't change ordering, it only
  bounds concurrency across independent submissions.
