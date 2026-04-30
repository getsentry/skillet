## ADDED Requirements

### Requirement: Centralized AI Job Queue

All LLM-bound calls SHALL pass through a single process-wide AI job
queue exposed by `src/agent/queue.ts`. The queue SHALL bound
concurrency to a configurable maximum, retry transient failures, and
enforce a per-job wall-clock timeout via AbortSignal.

#### Scenario: Concurrency cap respected
- **WHEN** the queue is configured with `concurrency: 4`
- **AND** 12 jobs are submitted simultaneously
- **THEN** at most 4 jobs are in the `started` state at any given
  moment; the rest remain `queued` until slots free

#### Scenario: Transient error retried
- **WHEN** a job throws a transient exception (network timeout,
  ECONNRESET, 429, 5xx, "overloaded")
- **THEN** the queue retries with exponential backoff up to
  `maxRetries` attempts, emitting a `retrying` event with the reason
  and delay

#### Scenario: Non-transient error fails immediately
- **WHEN** a job throws an exception that the classifier does not
  identify as transient (e.g. caller-level validation error, 4xx
  response without rate-limit signal)
- **THEN** the queue emits `failed` after one attempt and propagates
  the exception to the caller

#### Scenario: Timeout cancels the in-flight call
- **WHEN** a job exceeds `timeoutMs`
- **THEN** the queue aborts the AbortSignal passed to the job and
  the underlying pi-ai HTTP request is cancelled
- **AND** the timeout is treated as a transient failure, retried up
  to `maxRetries` times

### Requirement: completeWithBackoff Routes Through Queue

The `completeWithBackoff` function SHALL submit each call as a job
to the AI queue. Local retry logic inside `completeWithBackoff`
SHALL be removed; the queue is the single retry authority.

#### Scenario: Existing callers unchanged
- **WHEN** an existing caller invokes
  `completeWithBackoff(model, context)` with no `jobName`
- **THEN** the call still succeeds, treated as a queue job named
  `"ai"`

#### Scenario: Caller passes job name
- **WHEN** a caller invokes
  `completeWithBackoff(model, context, options, "eval-case:foo")`
- **THEN** the queue's job-event stream emits events with
  `name: "eval-case:foo"` for clustering and telemetry

### Requirement: Job Event Telemetry

The queue SHALL expose a `onJobEvent(handler)` subscription. Events
SHALL include `queued`, `started`, `retrying`, `succeeded`, and
`failed` with fields appropriate to each kind.

#### Scenario: Subscriber receives lifecycle events
- **WHEN** a subscriber registers via `onJobEvent`
- **AND** a job runs and succeeds on the second attempt
- **THEN** the subscriber receives `queued`, `started`, `retrying`,
  `started`, `succeeded` in order
