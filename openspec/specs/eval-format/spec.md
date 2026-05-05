# Eval Format Specification

## Purpose

Eval files define test cases for agent skills. They live in a
skill's `evals/` directory as TypeScript files (`*.eval.ts`) and
run under vitest via the harness-first
`describeEval(name, opts, (it) => { ... })` API mirrored from
[getsentry/vitest-evals#41](https://github.com/getsentry/vitest-evals/pull/41).

The format is harness-first, code-shaped, and judge-first:

- The deliverable is real `expect(...)` assertions on
  deterministic shapes plus named LLM-rubric judges via
  `await expect(result).toSatisfyJudge(NameJudge)` for semantic
  checks.
- Regex/substring matching against `result.session.outputText`
  (the agent's free-form chat reply) is **banned** — the agent
  paraphrases between runs and regex on free-form text tests the
  assertion's grammar more than the agent's behavior.

Generated eval files are durable: skillet generates each one
once when the corresponding spec entry has no eval file yet, and
leaves existing files untouched. Hand edits stick.

## Requirements

### Requirement: Eval-file layout per skill

A skill's `evals/` directory SHALL contain three kinds of artifact:

- `evals/_judges.ts` — suite-wide canonical named-judge declarations,
  one `export const FooJudge = judge("FooJudge", ...)` per unique
  judge across the suite. Generated; rewritten on every regen.
- `evals/fixtures/<case-slug>/<rel-path>` — per-case workspace seed
  files (real, readable files on disk). Each generated case that
  needs a fixture writes a tree under `evals/fixtures/<case-name>/`
  mirroring the workspace layout the agent should observe.
- `evals/<entry-id>.eval.ts` — one file per spec entry (behavior or
  must_not). Imports its judges from `./_judges.js` and calls
  `await harness.useFixture(<case-slug>)` to seed the workspace.

#### Scenario: Suite-wide _judges.ts deduped across behaviors
- **WHEN** the eval-writer agent produces files for 30 behaviors
  and 10 share the canonical judge `IdentifiesPrivilegedTriggerJudge`
- **THEN** `evals/_judges.ts` contains exactly one
  `export const IdentifiesPrivilegedTriggerJudge = criterionJudge(...)`
- **AND** every behavior's `.eval.ts` imports it from
  `./_judges.js` and references it via `toSatisfyJudge`

#### Scenario: Disk-backed fixtures replace inline shell heredocs
- **GIVEN** a case that needs the agent to audit
  `.github/workflows/ci.yml`
- **THEN** `evals/fixtures/<case-name>/.github/workflows/ci.yml`
  exists with the YAML content
- **AND** the rendered eval body contains
  `await harness.useFixture("<case-name>")` — not an inline
  shell-heredoc string

### Requirement: First-class assertion shapes

Generated eval files SHALL use only three assertion shapes:

1. **`output-match-object`** — structural equality on
   `result.output` via `expect(result.output).toMatchObject(...)`
   when the skill emits a structured finding block.
2. **`tool-calls`** — sequence/contains/excludes assertions on
   `toolCalls(result.session)` via `toEqual` /
   `expect.arrayContaining` / `not.toContain`.
3. **`judge`** — named LLM-rubric judges via
   `await expect(result).toSatisfyJudge(NameJudge)`. Multiple
   narrow judges per case are encouraged for free-form rules.

#### Scenario: Banned regex/substring assertion in plan
- **WHEN** an `AssertionPlan` includes a kind of `output-matches`,
  `output-contains`, or `output-not-contains`
- **THEN** the renderer throws `RenderError` with a migration
  message naming the kind and recommending one of the three
  first-class shapes

#### Scenario: Mix of structural and judge in one case
- **WHEN** a generated case has an `output-match-object` AND a
  `judge` assertion
- **THEN** the rendered `it()` body emits both — the structural
  assertion before the judge — and both must pass for the case
  to pass

### Requirement: Named judge factory and toSatisfyJudge matcher

Skillet SHALL ship `judge("Name", async ({ criterion }) => ...)`
and `toSatisfyJudge` from `@sentry/skillet/evals`. The matcher
SHALL be registered on vitest's `expect` at module import so any
`.eval.ts` that imports from `@sentry/skillet/evals` gets the
matcher automatically.

The judge body's `criterion(text)` helper SHALL invoke the
existing LLM judge (`src/eval/judge.ts`) with the agent's
transcript + workspace artifacts and return
`{ score, metadata: { rationale, grade } }`.

#### Scenario: Judge rubric routes through LLM judge
- **GIVEN** a generated judge `judge("RatesHighSeverityJudge",
  async ({ criterion }) => criterion("Rates HIGH or CRITICAL"))`
- **WHEN** a test calls
  `await expect(result).toSatisfyJudge(RatesHighSeverityJudge)`
- **THEN** the matcher invokes the LLM judge with the result's
  transcript + the criterion text
- **AND** records the named result on `task.meta.judges` so the
  reporter can surface it

### Requirement: Per-test fixture API

Each `it()` body SHALL receive a fixture exposing `run` from
the upstream `vitest-evals` harness API, plus skillet's
`createWorkspace` helper available as a barrel import.

- `run(input, opts?): Promise<HarnessRun>` — invokes the harness
  exactly once; populates `task.meta.harness.run` for reporter
  consumption.
- `createWorkspace(skillRoot, slug?): string` — copies
  `<skill-root>/evals/fixtures/<slug>/` into a fresh tempdir and
  registers cleanup via vitest's `onTestFinished`. Returns the
  tempdir path; pass it via `metadata.cwd` to `run`.

#### Scenario: createWorkspace seeds workspace before run
- **WHEN** an `it()` body calls
  `const cwd = createWorkspace(skillRoot, "foo")` followed by
  `await run("audit ...", { metadata: { cwd } })`
- **AND** `evals/fixtures/foo/.github/workflows/ci.yml` exists
- **THEN** the agent observes that file at its workspace root
  with the correct content

### Requirement: Discovery and `tests_behavior` metadata

Skillet SHALL discover eval files by globbing
`evals/**/*.eval.ts` under the skill root. The behavior id is
read from each test's enclosing `describeEval(name, …)` suite
name (which equals the spec entry id). The runner reads this
when normalizing vitest's JSON output into `EvalCaseResult`.

#### Scenario: Reporter maps cases back to spec entries
- **WHEN** an eval case completes successfully
- **THEN** `EvalCaseResult.tests_behavior` equals the spec
  entry's id
- **AND** verify-coverage uses this mapping to report behaviors
  with no eval coverage

## Output layout

```
skills/<skill>/
├── SKILL.md                     ← skill body (skill-writer output)
├── spec.yaml                    ← source of truth
├── references/                  ← skill-writer output
│   └── <topic>.md
└── evals/
    ├── _judges.ts               ← canonical deduped judges
    ├── fixtures/                ← per-case workspace seeds
    │   └── <case-slug>/
    │       └── <rel-path>       ← real readable file
    └── <entry-id>.eval.ts       ← per-behavior eval, imports
                                   from _judges.js, calls
                                   harness.useFixture(<slug>)
```
