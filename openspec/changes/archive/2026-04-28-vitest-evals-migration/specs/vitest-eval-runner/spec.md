## ADDED Requirements

### Requirement: Vitest-based eval execution

`skillet eval` SHALL execute eval files by spawning vitest with the skill's `evals/` directory as the test root. The runner SHALL parse vitest's JSON reporter output and normalize it into skillet's `EvalRunResult` shape.

#### Scenario: Eval run produces EvalRunResult
- **WHEN** `skillet eval ./skill` is run on a skill with `evals/basic.eval.ts`
- **THEN** vitest executes the eval file and the result is a valid `EvalRunResult` with `cases[]` and `summary`

#### Scenario: Per-case results include tests_behavior
- **WHEN** an eval case in the `data` array contains `tests_behavior: "flag-n-plus-one"`
- **THEN** the corresponding `EvalCaseResult` in the output includes `tests_behavior: "flag-n-plus-one"`

#### Scenario: Failed eval produces fail status
- **WHEN** a vitest test case fails (assertion error or judge below threshold)
- **THEN** the corresponding `EvalCaseResult` has `status: "fail"`

#### Scenario: Vitest not installed
- **WHEN** vitest is not available in the skill's environment
- **THEN** `skillet eval` exits with a clear error message naming the missing dependency

### Requirement: Skillet harness adapter

Skillet SHALL export a `skilletHarness` function from `@sentry/skillet/harness` that returns a vitest-evals–compatible `Harness`. The harness SHALL wrap skillet's `runAgent` to create a temp workspace, load the skill, run the agent, and return a `HarnessRun`.

#### Scenario: Harness creates workspace from setup script
- **WHEN** a case includes `setup` in its data
- **THEN** the harness executes the setup script in a temporary directory before running the agent

#### Scenario: Harness returns normalized session
- **WHEN** the agent completes
- **THEN** `HarnessRun.session.messages` contains the full conversation transcript and `HarnessRun.output` contains the agent's final text output

#### Scenario: Harness cleans up workspace
- **WHEN** the agent completes (pass or fail)
- **THEN** the temporary workspace directory is removed

#### Scenario: Harness respects timeout
- **WHEN** a case specifies a `timeout` in the `describeEval` options
- **THEN** the harness aborts the agent run after the specified duration

### Requirement: Vitest configuration

When `skillet eval` runs, it SHALL provide a vitest configuration that sets the test root to the skill's `evals/` directory, enables the vitest-evals reporter, and configures the JSON reporter for programmatic result parsing.

#### Scenario: Config resolves eval files
- **WHEN** vitest runs with skillet's config
- **THEN** it discovers all `evals/*.eval.ts` files in the skill directory

#### Scenario: Config enables JSON output for parsing
- **WHEN** vitest completes
- **THEN** a JSON result file is written that the runner can parse into `EvalRunResult`
