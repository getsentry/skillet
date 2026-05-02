## ADDED Requirements

### Requirement: Global AI Concurrency Flag

Skillet SHALL accept a `--ai-concurrency=N` flag on any command.
When omitted, the queue's concurrency SHALL default to
`SKILLET_AI_CONCURRENCY` env if set, otherwise `4`.

#### Scenario: Flag overrides env
- **WHEN** `SKILLET_AI_CONCURRENCY=8` is set
- **AND** `skillet eval --ai-concurrency=2` is run
- **THEN** the queue is configured with concurrency `2`

#### Scenario: Default concurrency
- **WHEN** no env var or flag is set
- **THEN** the queue is configured with concurrency `4`

### Requirement: End-of-Command AI Job Summary

After every command that uses the AI queue, skillet SHALL print a
summary block: total succeeded, total retried, total failed, and
failures clustered by job-name prefix.

#### Scenario: Eval run prints summary
- **WHEN** `skillet eval` runs against a 10-case skill, 1 case fails
- **THEN** the final stderr block includes
  `AI jobs: <n> succeeded, <m> retried, 1 failed` and a clustered
  list of failing job names

### Requirement: Deprecated Per-Command Concurrency Flags

`eval --concurrency` and `compare --concurrency` SHALL continue to
parse, print a one-line deprecation note to stderr, and apply the
provided value to the queue concurrency. Removal SHALL be tracked
for a future change.

#### Scenario: Deprecated flag still works
- **WHEN** `skillet eval --concurrency 6` is run
- **THEN** stderr includes a deprecation note pointing to
  `--ai-concurrency` and the queue concurrency is set to `6`
