# Judge Delta

## REMOVED Requirements

### Requirement: Judge results in normalized format
**Reason**: The vitest-evals normalized result shape no longer exists.
**Migration**: Judge outcomes appear as check results in the new eval result JSON (see cli JSON output convention).

### Requirement: Judge Invocation
**Reason**: Superseded by harness-executed judging with the same ordering rule, respecified below.
**Migration**: None; behavior is respecified.

### Requirement: Judge Prompt
**Reason**: The A–E rubric prompt was coupled to the in-process judge call.
**Migration**: Respecified as a pass/fail verdict with reasoning, executed through the harness.

### Requirement: Threshold Comparison
**Reason**: Score thresholds (0.75 etc.) were a source of tuning churn without demonstrated signal. Judges now return a binary verdict; statistical confidence comes from `--trials`, not score calibration.
**Migration**: Remove `threshold` fields; use `--trials` for repeatability.

### Requirement: Judge Model Selection
**Reason**: There is no judge model to select; the harness CLI decides its own model.
**Migration**: Delete `SKILLET_JUDGE_MODEL`.

### Requirement: Judge Output in Results
**Reason**: Folded into the check-result shape of the new eval output.
**Migration**: Read judge verdicts from the case's `checks` results in `--json` output.

## ADDED Requirements

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
