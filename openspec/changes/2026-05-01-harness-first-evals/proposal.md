# Harness-First Evals (vitest-evals#41 convergence)

## Why

Generated `.eval.ts` files use the data-array form `describeEval(name,
{ data: [...], judges: [SubstringJudge(), CriterionJudge()] })`. The
upstream API in getsentry/vitest-evals#41 has settled on a callback
form — `describeEval(name, opts, (it) => { it("...", async ({ run })
=> {...}) })` — where each case is a normal vitest test, assertions
are real `expect(...)` calls, tool usage is asserted on
`run.session.toolCalls`, and LLM grading is opt-in via a *named*
`toSatisfyJudge(NamedJudge)`.

Two concrete problems with what we ship today:

1. **Cases read like prose, not code.** Each case carries a
   multi-paragraph `criteria` string fed to a generic
   `CriterionJudge`. The reader can't tell what's being checked
   without reading the LLM's mind. See `getsentry/warden-skills` PR #2
   for the symptom — every case is a wall of text.
2. **No structural assertions.** Substring is the only deterministic
   check available; everything else lands in a judge paragraph. Tool-
   call ordering, output shape, file presence, severity tag, JSON-
   field equality — all expressible as `expect(...)`, none of them
   used.

Convergence with #41 fixes both: deterministic things become real
`expect(...)` blocks, subjective things become *named* judges that a
reviewer can read top-of-file, and the file shape matches what
agents/devs see in any other vitest-backed eval suite.

## What Changes

- **MODIFIED** Generated `.eval.ts` files use the callback form.
  Each spec entry produces `describeEval(id, { harness, judges? },
  (it) => { it("case-name", async ({ run }) => { ... }) })` with
  real `expect(...)` assertions in the body.
- **MODIFIED** Eval-gen LLM call no longer emits final TS. It emits
  a structured **assertion plan** per case (a discriminated-union
  list of `match-object`, `regex`, `contains`, `not-contains`,
  `tool-calls`, `judge`, plus optional `setup`); skillet renders the
  TS file from the plan. Existing parse-retry/diagnostic plumbing
  stays valid.
- **MODIFIED** Judge primitives. `CriterionJudge()` and
  `SubstringJudge()` are dropped from the public surface. Replaced
  with a `judge("Name", async (opts) => ...)` factory and a
  `toSatisfyJudge(NamedJudge)` matcher registered via
  `expect.extend`. Cases that need LLM grading get a named judge
  declared at the top of the file (e.g. `const SeverityJudge =
  judge("SeverityJudge", ...)`), reusable across that file's cases.
- **MODIFIED** Per-case timeout becomes the second arg to
  `it("name", { timeout }, async ({ run }) => ...)` instead of a
  `timeout:` field on case data.
- **MODIFIED** Per-case `setup` (shell script seeding the workspace)
  is invoked before `await run(...)` via a
  `await harness.setup(setupScript)` helper exposed on the harness
  context, instead of being read off `caseData.setup`.
- **MODIFIED** `tests_behavior` metadata moves from a per-case data
  field to the suite-level `describeEval` name (which already equals
  the entry id) and a per-test `task.meta.tests_behavior` set inside
  `it()` via a small helper. The vitest-runner reporter reads it
  from there.
- **MODIFIED** `src/vitest-evals/describe-eval.ts` gains the
  callback form. Existing data-array form stays working — generated
  files prior to this change keep running unchanged. New generation
  always uses the callback form.
- **MODIFIED** `src/eval/vitest-runner.ts` reporter consumes the new
  meta channel populated by `toSatisfyJudge` (judge results, named
  scores) in addition to the legacy `meta.eval.scores` shape.

## Non-Goals

- **Switching to upstream `vitest-evals` 0.9.** Local mini-lib stays
  until the package ships. The file shape on disk is the contract;
  the import path (`@sentry/skillet/evals`) is unchanged.
- **Auto-converting old `.eval.ts` files.** Existing data-array
  files keep running via the compat path; rewrites happen
  case-by-case as users edit. New skills get the new shape.
- **Replacing the LLM judge for genuinely subjective behaviors.**
  Named judges still call out to a model when the assertion is
  semantic. The change is *what's expressed in code vs in a judge*,
  not removing judges.
- **Introducing snapshot/replay.** vitest-evals#41 ships replay; we
  defer adoption.

## Capabilities Touched

- `eval-format` — file shape (callback form, `expect()`, named
  judges, `it`-level timeout).
- `skill-authoring` — eval-gen LLM contract (assertion plan, not
  TS) and renderer.
