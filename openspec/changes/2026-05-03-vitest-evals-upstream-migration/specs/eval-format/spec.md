## MODIFIED Requirements

### Requirement: Eval-file layout per skill

A skill's `evals/` directory SHALL contain three kinds of
artifact:

- `evals/_judges.ts` — suite-wide canonical named-judge
  declarations, one
  `export const FooJudge = criterionJudge("FooJudge", "...")`
  per unique judge across the suite. Generated; rewritten on
  every regen.
- `evals/fixtures/<case-slug>/<rel-path>` — per-case workspace
  seed files (real, readable files on disk).
- `evals/<entry-id>.eval.ts` — one file per spec entry.
  Imports judges from `./_judges.js` and other helpers from
  `@sentry/skillet/evals`. Uses
  `withWorkspace(it, { skillRoot })` to extend the test API
  with a `workspace(slug?)` factory; tests pass the resulting
  cwd through `metadata` to `run()`.

#### Scenario: Suite-wide _judges.ts deduped across behaviors
- **WHEN** eval-gen produces plans for 30 behaviors and 10
  declare the canonical judge `IdentifiesPrivilegedTriggerJudge`
- **THEN** `evals/_judges.ts` contains exactly one
  `export const IdentifiesPrivilegedTriggerJudge = criterionJudge(...)`
- **AND** every behavior's `.eval.ts` imports it from
  `./_judges.js` and references it via `toSatisfyJudge`

#### Scenario: Disk-backed fixtures use vitest-native lifecycle
- **GIVEN** a case that needs the agent to audit
  `.github/workflows/ci.yml`
- **THEN** `evals/fixtures/<case-name>/.github/workflows/ci.yml`
  exists with the YAML content
- **AND** the rendered eval body contains
  `const cwd = await workspace("<case-name>")` followed by
  `await run(input, { metadata: { cwd } })`
- **AND** workspace cleanup happens via the vitest fixture's
  `use(value)` lifecycle (no `harness.useFixture` call)

### Requirement: Per-test fixture API

Each `it()` body SHALL receive a fixture exposing `run` (from
upstream `vitest-evals`) plus `workspace` (from skillet's
`withWorkspace` helper). The fixture members provide:

- `run(input, opts?): Promise<HarnessRun>` — invokes the
  harness exactly once. Skillet tests pass
  `{ metadata: { cwd } }` so the harness can use the workspace
  the fixture seeded.
- `workspace(slug?): Promise<string>` — creates a tempdir;
  if `slug` is provided, recursively copies
  `<skill-root>/evals/fixtures/<slug>/` into it; returns the
  tempdir path. The vitest fixture's `use(value)` boundary
  registers cleanup so tempdirs are removed on success or
  failure.

#### Scenario: workspace seeds tempdir before run
- **WHEN** an `it()` body calls
  `const cwd = await workspace("foo")` followed by
  `await run("audit ...", { metadata: { cwd } })`
- **AND** `evals/fixtures/foo/.github/workflows/ci.yml` exists
- **THEN** the agent observes that file at the workspace root
- **AND** the tempdir is cleaned up after the test

### Requirement: Discovery and behavior mapping

Skillet SHALL discover eval files by globbing
`evals/**/*.eval.ts` under the skill root. The `describeEval`
suite id IS the spec entry id (one suite per behavior); the
reporter reads it from `task.suite?.name` when normalizing
vitest's output into `EvalCaseResult`. The static discovery
extractor reads the same id via regex.

#### Scenario: Reporter maps cases back to spec entries
- **WHEN** an eval case completes successfully
- **THEN** `EvalCaseResult.tests_behavior` equals the suite
  name (= the spec entry id)
- **AND** verify-coverage uses this mapping to report
  behaviors with no eval coverage

## REMOVED Requirements

### Requirement: Compat — legacy data-array describeEval

**Reason**: The legacy data-array form was already removed in
the prior cleanup pass. This requirement no longer applies.

**Migration**: None — no consumers remain.
