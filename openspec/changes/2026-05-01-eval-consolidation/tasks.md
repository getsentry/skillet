# Tasks

## Plan + types

- [ ] 1. `src/authoring/phases/eval-gen-types.ts`: rename
       `CasePlan.setup?: string` → `CasePlan.fixture?: Record<string, string>`.
       Keep `setup` as an optional deprecated alias accepted by
       the parser for compat.
- [ ] 2. Add internal `ConsolidatedPlan` type — like `CasePlan`
       but with `fixtureSlug?: string` instead of `fixture` (the
       fixture content has been written; the case references it
       by slug).

## Consolidation module

- [ ] 3. New module `src/authoring/phases/eval-gen-consolidate.ts`
       exporting:
       ```ts
       export interface ConsolidationResult {
         judges: JudgePlan[];                      // canonical, sorted by name
         perEntry: Array<{ entryId: string; plan: ConsolidatedPlan }>;
         fixtures: Record<string, Record<string, string>>;
         conflicts: Array<{ judgeName: string; criteria: string[] }>;
       }
       export const consolidate = (
         plans: Array<{ entryId: string; plan: AssertionPlan }>,
       ): ConsolidationResult;
       ```
- [ ] 4. Dedup logic: exact-name match across entries. First
       criterion wins. Conflicts collected but non-fatal.
- [ ] 5. Fixture extraction: each case's `fixture` map is
       collected into `fixtures[<case-name>]`; the per-entry
       plan's case retains `fixtureSlug = <case-name>` and drops
       the inline content.

## Renderer

- [ ] 6. `src/authoring/phases/eval-gen-render.ts`: change
       `renderEvalFile` signature to
       `renderEvalFile(entryId, plan: ConsolidatedPlan, sharedJudges: JudgePlan[]): string`.
       Drop the inline judge declarations from the file body;
       emit `import { … } from "./_judges.js"` instead, sorted,
       only for the judges this entry references.
- [ ] 7. Add `renderJudgesFile(judges: JudgePlan[]): string`
       that renders the suite-wide `_judges.ts` (banner + one
       `export const FooJudge = judge(...)` per canonical judge).
- [ ] 8. Renderer's per-case body: when `fixtureSlug` is set,
       emit `await harness.useFixture(<slug>)`. When `setup`
       (legacy) is set, fall back to
       `await harness.setup(<script>)`. When neither, no setup
       call.
- [ ] 9. Keep existing renderer caps (≤5 judges per file refers
       to per-entry-declared judges, but those move to
       `_judges.ts`; the per-file cap becomes "the entry
       references ≤5 distinct judges across its cases").

## Harness

- [ ] 10. `src/harness/index.ts`: extend
        `FixtureHarness<TInput>` with
        `useFixture(slug: string): Promise<void>`. The skillet
        harness implementation:
        - Resolves `<skill-root>/evals/fixtures/<slug>/`.
        - Throws a clear error if the directory doesn't exist.
        - Recursively copies files into the per-test workspace.
- [ ] 11. `src/vitest-evals/types.ts`: add `useFixture` to
        `FixtureHarness<TInput>` interface so generated TS
        type-checks. The wrapper in `describe-eval.ts`'s
        callback-form `it()` proxies `useFixture` straight to
        the underlying harness (no per-test state needed —
        unlike `setup`, `useFixture` is idempotent).

## Phase wiring

- [ ] 12. Modify `runEvalGen`:
        - Replace the per-entry `writeFileSync` inside
          `generateAndWrite` with collecting an
          `Array<{ entryId, plan }>` after each entry's
          generate+verify completes.
        - After all entries settle, call `consolidate(...)`.
        - Render `_judges.ts` once and write it to
          `evals/_judges.ts`.
        - Iterate `consolidationResult.fixtures` and write each
          tree under `evals/fixtures/<slug>/`.
        - Render each entry's `.eval.ts` from the consolidated
          plan + shared judges and write it.
- [ ] 13. Telemetry events:
        - `eval-gen-consolidate behavior=<n/a> declared=<M> canonical=<N>`
        - `eval-gen-consolidate fixtures=<K>`
        - `eval-gen-consolidate conflict judge=<name> entries=<...>`
          (one event per conflict)
        - End-of-command summary picks these up.

## Generator + verifier prompt updates

- [ ] 14. `_code-eval-contract.ts`: add a "Stable judge naming"
        section recommending verb-prefix patterns
        (`Identifies…Judge`, `Rates…Judge`, `Connects…Judge`,
        `RecognizesNo…Judge`) so cross-entry dedup catches
        same-concept judges. Note that judges are deduped
        across the suite; reusing a name from another behavior
        intentionally collapses them.
- [ ] 15. Generator prompt: replace `setup` field examples with
        `fixture` examples (file maps showing real multi-file
        fixtures). Note the generator does NOT need to know
        about cross-entry dedup; just write good per-entry
        plans with stable judge names.
- [ ] 16. Verifier prompt: note that the verifier sees ONE
        plan, not the suite. Cross-entry dedup is automatic;
        the verifier's job is correctness of the plan in front
        of it.

## Smoke / regression

- [ ] 17. Re-run wrdn-gha-workflows regen with consolidation.
        Compare to prior run:
        - banned regex/string assertions: 0 (kept)
        - inline shell heredocs in eval files: 0 (replaced by
          `useFixture`)
        - per-file judge declarations: 0 in eval files (moved
          to `_judges.ts`)
        - `_judges.ts` line count: roughly the prior total
          declarations divided by ~2-3× (deduplication factor)
        - `evals/fixtures/`: ~30-50 case directories
- [ ] 18. Spot-check 3 files: confirm they read as ~30-50
        lines of pure imports + describeEval body, no inline
        shell, no inline judge declarations.
- [ ] 19. Soak test on `wrdn-authz` (different domain) to
        confirm consolidation generalizes.

## Validation

- [ ] 20. `npm run typecheck`
- [ ] 21. `npm run check` (lint baseline 0 errors)
- [ ] 22. `openspec validate 2026-05-01-eval-consolidation --strict`
