## Decision

Adopt upstream `vitest-evals@0.9.0-beta.0` as a real dependency
and delete `src/vitest-evals/`. Skillet keeps a thin `src/evals/`
layer for two skillet-specific concerns the upstream lib doesn't
own:

1. **`criterionJudge(name, text)`** — sugar over upstream's
   `namedJudge` that calls skillet's LLM-as-judge
   (`src/eval/judge.ts`) with a single criterion string. Most
   generated judges look like:
   ```ts
   export const FooJudge = criterionJudge(
     "FooJudge",
     "The response identifies the privileged trigger and the missing repo guard.",
   );
   ```

2. **`withWorkspace(it, { skillRoot })`** — vitest fixture helper
   that extends `it` with a `workspace(slug?)` factory. The
   factory creates a tempdir, optionally copies
   `evals/fixtures/<slug>/` into it, and registers cleanup via
   `use(value)`. Generated tests look like:
   ```ts
   describeEval("foo", { harness: skilletHarness({ skill: skillRoot }), judgeThreshold: 0.75 }, (raw) => {
     const it = withWorkspace(raw, { skillRoot });
     it("foo__case", async ({ run, workspace }) => {
       const cwd = await workspace("foo__case");
       const result = await run("audit ...", { metadata: { cwd } });
       await expect(result).toSatisfyJudge(FooJudge);
     });
   });
   ```

The `skilletHarness` adapter conforms to upstream
`Harness<string, { cwd?: string }>`. It reads `ctx.metadata.cwd`
for the workspace path; if absent it creates its own tempdir
(rare — only hand-edited cases that bypass the fixture).

## Rationale

- **Idiomatic vitest**. `it.extend(...)` + `use()` is exactly
  the right primitive for per-test setup with cleanup. The
  previous `harness.useFixture(slug)` was a side-channel
  side-stepping vitest's native lifecycle, which meant tempdirs
  could leak on test failure.
- **Minimum public surface**. `criterionJudge` + `withWorkspace`
  + `skilletHarness` are the three exports skillet owns. Everything
  else (`describeEval`, `toSatisfyJudge`, `Harness`, `toolCalls`,
  `JsonValue`, …) re-exports from upstream.
- **Discovery already covered behavior mapping**. `discovery.ts`
  reads the suite id via regex from
  `describeEval("...", ...)` — that IS the spec entry id. The
  runtime `behavior(id)` call only stamped `task.meta`, which the
  reporter can pull from `task.suite?.name` instead.

## Risks

- **Beta pin**. `0.9.0-beta.0` is on `next`, not `latest`. We
  pin exactly until cramer cuts stable; `npm i @sentry/skillet`
  in a downstream repo gets the beta transitively. Acceptable
  short-term given the upstream surface is stable from PR #41.
- **Mass eval-file regen**. Every existing `*.eval.ts` in this
  repo and downstream skill repos must regenerate. Mitigated by
  the eval-gen pipeline being deterministic-from-spec — repos
  with a `spec.yaml` regenerate cleanly.

## Alternatives Considered

- **Keep the mirror in place; depend on upstream for types only**.
  Rejected: AGENTS.md already commits to retiring the mirror, and
  carrying it once upstream ships is dead weight that diverges.
- **Pass fixture slug via `metadata.fixture` and let the harness
  copy**. Rejected: tempdir lifecycle isn't bound to vitest's
  test lifecycle, leaks on failure, and pushes vitest-shaped
  concerns into the harness.
- **Use `test.extend` with a static fixture (not a factory)**.
  Rejected: per-test slug selection requires either parameterized
  fixtures (which vitest doesn't support directly) or per-test
  extend calls — the factory pattern keeps the same `it.extend`
  block usable for every test in the file.
