## ADDED Requirements

### Requirement: JSON output mode for eval

The `eval` command SHALL support a `--json` flag that outputs structured results in a format compatible with vitest-evals' normalized types.

#### Scenario: JSON eval output
- **WHEN** `skillkit eval --json` is run
- **THEN** stdout contains a single JSON object with `cases` array and `summary` object, with no ANSI escape codes

#### Scenario: Default output remains pretty
- **WHEN** `skillkit eval` is run without `--json`
- **THEN** output uses ANSI-colored pass/fail/skip/error icons as before

### Requirement: Normalized result shape

Each eval case result SHALL include a `session` object with `messages` array, a `usage` object, structured `checks` and `judge` results, and an `errors` array. These shapes SHALL be compatible with vitest-evals' `NormalizedSession`, `UsageSummary`, and `HarnessRun` types.

#### Scenario: Case result contains session
- **WHEN** an eval case completes
- **THEN** the result includes `session.messages` as an array of `{ role, content }` objects and optionally `session.outputText`

#### Scenario: Case result contains usage
- **WHEN** an eval case completes
- **THEN** the result includes `usage` with at minimum `toolCalls` count, and optionally `provider`, `model`, `totalTokens`

### Requirement: JSON output for validate

The `validate` command SHALL support a `--json` flag that outputs structured validation results.

#### Scenario: JSON validate output
- **WHEN** `skillkit validate --json` is run
- **THEN** stdout contains a JSON object with `valid` boolean and `errors` array of `{ path, message }` objects
