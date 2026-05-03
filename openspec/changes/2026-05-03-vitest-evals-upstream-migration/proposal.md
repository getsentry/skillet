## Why

Cramer merged getsentry/vitest-evals#41 (the harness-first
callback API skillet has been mirroring) and published
`vitest-evals@0.9.0-beta.0` to npm. Skillet's `src/vitest-evals/`
mirror — explicitly tagged "Replaceable by the upstream package
once it ships" in AGENTS.md — can retire. Two of our three
skillet-specific extensions are also unnecessary: the `behavior(id)`
helper duplicates information already encoded in the
`describeEval` suite name (which static discovery already reads),
and `harness.useFixture(slug)` reimplements what vitest's native
`test.extend({ workspace: async ({}, use) => ... })` fixture
mechanism does cleanly.

## What Changes

- **BREAKING** `evals/*.eval.ts` files change shape. Generated
  files now import `describeEval`, `toSatisfyJudge`, etc. from
  `@sentry/skillet/evals` (which re-exports `vitest-evals`),
  declare a `workspace` fixture via `it.extend(...)`, and pass
  `{ metadata: { cwd } }` to `run()`. The `behavior(id)` and
  `harness.useFixture(slug)` helpers go away.
- **NEW DEPENDENCY** `vitest-evals@0.9.0-beta.0` (exact pin on
  the `next` dist-tag until cramer cuts a stable release).
- **REMOVED** `src/vitest-evals/` mirror. The skillet-specific
  helpers (`criterionJudge`, `withWorkspace`, the `skilletHarness`
  adapter) move to a small `src/evals/` module re-exported via
  `@sentry/skillet/evals`.
- **REMOVED** `task.meta.tests_behavior` runtime side-channel.
  The reporter reads `task.suite?.name` (which equals the
  `describeEval` id, which equals the spec entry id) instead.
  Static `discovery.ts` was already the primary source.
- **MODIFIED** Eval-gen renderer (`src/authoring/phases/eval-gen-render.ts`)
  emits the new shape. Generator + verifier prompts and
  `_code-eval-contract.ts` updated accordingly.
- **MODIFIED** `skilletHarness` conforms to upstream
  `Harness<TInput, TMetadata>`: reads `cwd` from
  `ctx.metadata`, drops the `caseData.fixtureSlug`/`setup` reads.
  Workspace lifecycle (tempdir create + cleanup) moves into the
  vitest fixture layer.
- **MODIFIED** Self-skill (`skills/skillet/`) evals regenerated
  through the new pipeline as the proof-of-concept.

## Capabilities

### Modified Capabilities

- `eval-format`: file shape, fixture mechanism, discovery
  metadata channel.
- `skill-authoring`: eval-gen renderer + prompts.

### Removed Capabilities

None — the mirror was internal.

## Impact

- `src/vitest-evals/` deleted (~500 LOC).
- New `src/evals/` (~80 LOC: `criterionJudge`, `withWorkspace`,
  re-exports, harness adapter wrapper).
- `package.json`: adds `vitest-evals` dep, updates `exports`
  target.
- `src/eval/vitest-runner.ts` + `src/eval/types.ts`: drop
  `tests_behavior` meta path; reporter reads suite name.
- `src/authoring/phases/eval-gen-render.ts` + `_judges.ts`
  template: new emit shape.
- `src/authoring/prompts/_code-eval-contract.ts` +
  `eval-gen.ts` + `eval-gen-verify.ts`: updated rules.
- `skills/skillet/evals/`: regenerated as the proof.
- `LIFECYCLE.md`, `AGENTS.md`: drop mirror references.

Investigation-first principle (AGENTS.md) is satisfied by
running `skillet eval skills/skillet` end-to-end **before**
deleting the mirror.
