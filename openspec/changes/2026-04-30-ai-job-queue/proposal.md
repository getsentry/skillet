# AI Job Queue

## Motivation

LLM-bound work in skillet is currently throttled inconsistently:
`eval --concurrency` is per-case, `compare --concurrency` is per-skill
× per-case (effectively double), spec-author/eval-gen/reference-gen
have no throttling at all (they just call `completeWithBackoff` and
hope), and `completeWithBackoff` carries its own retry logic that's
local-per-call.

Two consequences:
- Compare at concurrency 8 floods the provider — the test session saw
  widespread timeouts.
- Retry/backoff is fragmented. Each caller gets it via CWB but the
  queue can't apply policy across the run (e.g. circuit-breaker
  behavior, end-of-run failure clustering).

## Change

Centralize all LLM calls through a single process-wide AI job queue.
Every call site (eval cases, eval-gen, reference-gen, spec-author
turns, semantic-verify chunks, judge calls) submits a job; the queue
owns concurrency, retry, timeout, and telemetry.

One global concurrency knob (`SKILLET_AI_CONCURRENCY`, default 4).
Per-command flags removed — vitest's worker pool no longer races
against the LLM throttle, it just blocks on queue submissions.

Retry is a queue concern, not a caller concern. `completeWithBackoff`
becomes a thin pi-ai wrapper that submits a job and awaits. The
queue's classifier (re-using the existing transient-error rules)
decides retry; timeouts are retryable.

## What Changes

- **New module** `src/agent/queue.ts`: `submitAiJob`, `onJobEvent`,
  `getQueueConfig`, `setQueueConfig`. Bounded-concurrency semaphore,
  per-job timeout via `AbortController`, exponential backoff with
  jitter, classifier-driven retry.
- **`completeWithBackoff` rewrite**: signature gains optional `name`
  for telemetry. Internally submits to the queue. Existing retry
  loop is removed (queue owns it). All 12 call sites work unchanged
  (optional name passes through telemetry).
- **`AbortSignal` plumbing**: queue passes a signal to the job; CWB
  passes it to pi-ai's `complete`. Timeout cancels in-flight HTTP
  cleanly.
- **CLI**: `--ai-concurrency=N` global flag (any command). Env:
  `SKILLET_AI_CONCURRENCY`, `SKILLET_AI_RETRIES`, `SKILLET_AI_TIMEOUT`.
- **Removed flags**: `eval --concurrency`, `compare --concurrency`,
  `compare --case-concurrency`, `compare --skill-concurrency`. Old
  flag names print a deprecation note + map to `--ai-concurrency`.
- **End-of-command summary**: queue prints a job-event summary
  (succeeded/retried/failed counts, plus failures clustered by
  `name` prefix). Replaces the ad-hoc compare timeout reporting.

## Non-Goals

- **Per-provider concurrency** (Anthropic vs OpenAI rate limits).
  Single global pool is fine for now; revisit if mixed-provider runs
  hit one provider's limit harder than the other.
- **Persistent queue** across process restarts. Process-scoped only.
- **Eval `kind` tagging / compare bias filter.** Separate concern,
  unrelated to throttling. Will be its own change.
- **Boundary preservation / quality work.** Deferred.

## Capabilities Touched

- `agent` — new queue module, CWB rewrite.
- `cli` — global concurrency flag, removed per-command flags.
