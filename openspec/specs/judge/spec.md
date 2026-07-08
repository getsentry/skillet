# Judge Specification

## Purpose

The LLM judge evaluates agent output against natural language criteria when structural checks alone are insufficient. It provides a score from 0.0 to 1.0, compared against a configurable threshold. The judge is a separate LLM call from the agent under test — it receives the agent's output and the criteria string, and grades the result.
## Requirements
### Requirement: Harness-executed judge

A `judge:` check SHALL be graded by invoking the configured harness CLI with a grading prompt containing the criterion, the case prompt, the agent transcript, and a listing of workspace changes. The judge invocation runs in a directory isolated from the eval workspace and MUST NOT modify the workspace. The verdict is parsed as pass/fail plus a one-paragraph reasoning.

#### Scenario: Judge passes
- **WHEN** a judge check's criterion is satisfied by the transcript and workspace state
- **THEN** the harness-run judge returns a pass verdict and the check passes

#### Scenario: Unparseable verdict
- **WHEN** the judge output cannot be parsed into a verdict
- **THEN** the check is retried once, and if still unparseable the case is marked errored (not failed) with the raw judge output attached

### Requirement: Judge only after deterministic checks

Judge checks SHALL run only when all deterministic checks in the case have passed, to avoid spending agent invocations grading already-failed cases.

#### Scenario: Deterministic failure skips judge
- **WHEN** a `file_exists` check fails
- **THEN** the case's judge checks are skipped and reported as skipped

