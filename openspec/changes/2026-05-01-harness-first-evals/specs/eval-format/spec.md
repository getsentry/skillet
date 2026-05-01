# Eval Format — Harness-First Convergence

## MODIFIED Requirements

### Requirement: Generated eval files use harness-first callback API

Generated `.eval.ts` files SHALL use the callback form
`describeEval(name, options, (it) => { ... })` introduced in
getsentry/vitest-evals#41. Each case is one `it("name", { timeout? },
async ({ run, behavior }) => { ... })` block whose body issues
real `expect(...)` assertions and (optionally) one
`await expect(result).toSatisfyJudge(NamedJudge)` call.

The data-array form `describeEval(name, { data: [...] })` SHALL
continue to load and run for files generated before this change, but
SHALL NOT be produced by new generations.

#### Scenario: New eval file uses callback form
- **WHEN** `skillet create` or eval-gen generates an eval file for a
  spec entry
- **THEN** the file imports from `@sentry/skillet/evals`, declares
  named judges (if any) at file scope via `judge("Name", ...)`,
  and emits `describeEval(id, { harness }, (it) => { it(...) })`
- **AND** each `it()` body uses `expect(...)` to assert deterministic
  shape and `await expect(result).toSatisfyJudge(...)` for any
  semantic checks

#### Scenario: Pre-change data-array file still runs
- **GIVEN** an eval file generated before this change using
  `data: [...]` and `judges: [SubstringJudge(), CriterionJudge()]`
- **WHEN** `skillet eval` runs against the containing skill
- **THEN** the runner executes the file via the data-array
  describeEval overload and reports results with the same fields
  as before

### Requirement: Named judges

LLM-graded assertions SHALL be expressed as named judge functions
declared at file scope via `judge("Name", async (opts) => ...)`.
Cases reference judges by name via
`await expect(result).toSatisfyJudge(JudgeName)`.

`CriterionJudge()` and `SubstringJudge()` SHALL be removed from the
public surface of `@sentry/skillet/evals`. For one release, deprecated
shims SHALL re-export those names with their previous behavior so
data-array files continue to load; the shims SHALL be removed in the
following minor.

#### Scenario: File declares one judge per behavior
- **WHEN** an eval file is generated for a behavior whose assertions
  include any LLM-judged checks
- **THEN** exactly one named judge is declared at file scope, named
  in PascalCase ending in `Judge` (e.g. `PwnRequestJudge`)
- **AND** all judged cases in that file reference the same judge

#### Scenario: Named judge result surfaces in reporter
- **WHEN** a case calls `await expect(result).toSatisfyJudge(FooJudge)`
- **AND** the underlying LLM judge returns a score and rationale
- **THEN** the reporter exposes `{ name: "FooJudge", score, rationale }`
  on the case result's `judge` field

### Requirement: Per-case timeout via `it` options

Per-case timeouts SHALL be set via the `{ timeout }` options bag of
`it("...", { timeout }, async ...)`. The `timeout` field on case data
SHALL no longer be read by generated files (the field is unused by
the new shape).

#### Scenario: Case with elevated timeout
- **WHEN** a generated case has a planned timeout of 90000 ms
- **THEN** the rendered file emits
  `it("name", { timeout: 90_000 }, async ({ run }) => ...)`

### Requirement: Per-case workspace setup via harness helper

Per-case shell setup (seeding fixture files in the workspace) SHALL
be invoked from inside the test body via
`await harness.setup(script)` exposed on the test fixture, instead
of being read from a `setup:` field on case data.

#### Scenario: Setup runs before agent
- **WHEN** a generated case has a `setup` script
- **THEN** the `it()` body issues `await harness.setup(setupScript)`
  before `await run(input)`
- **AND** the agent observes the seeded workspace state

### Requirement: `tests_behavior` populated via behavior helper

Each `it()` body SHALL call `behavior(<entry-id>)` (provided as part
of the test fixture) to populate `task.meta.tests_behavior` so the
runner can map case results back to spec entries. The metadata
channel SHALL be the same key the previous data-array path wrote to.

#### Scenario: Reporter reads tests_behavior from meta
- **WHEN** an eval case completes successfully
- **THEN** `task.meta.tests_behavior` equals the spec entry id
- **AND** the runner's `EvalCaseResult.tests_behavior` field reflects
  that id
