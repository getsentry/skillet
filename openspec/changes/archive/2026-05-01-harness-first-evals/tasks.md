# Tasks

## Mini-lib: callback-form describeEval

- [ ] 1. `src/vitest-evals/describe-eval.ts`: add the
       `(name, opts, body: (it) => void)` overload. Existing
       `(name, opts)` data-array form stays. Callback form wires
       `describe.concurrent`, hands `body` an `it` wrapper.
- [ ] 2. `it` wrapper: accepts optional `{ timeout }` between name
       and async function. Provides a fixture
       `{ run, behavior, harness, expect }` to the test body.
- [ ] 3. `behavior(id)` helper: writes
       `task.meta.tests_behavior = id`. Used so the runner can
       still map cases back to spec entries.
- [ ] 4. `run(input, opts?)`: thin wrapper around
       `harness.run(input, ctx)`; populates `task.meta.harness.run`
       on settle.

## Mini-lib: judges + matcher

- [ ] 5. `src/vitest-evals/judges.ts`: replace
       `CriterionJudge`/`SubstringJudge` with
       `judge(name, fn)` factory. The factory tags the function
       with `.name` and a stable internal symbol used by the
       matcher.
- [ ] 6. `expect.extend({ toSatisfyJudge })` registered from
       `src/vitest-evals/index.ts`. Matcher signature:
       `toSatisfyJudge(judge: JudgeFn, options?: { threshold?: number })`.
       Accepts `HarnessRun` or any object with `session`/`output`.
- [ ] 7. Internal `criterion(text)` helper available inside judge
       fn body: routes through existing `runJudge(model, transcript,
       text, artifacts)` so the LLM-judge path is unchanged.
- [ ] 8. Compat shims: re-export `CriterionJudge`/`SubstringJudge`
       names from `src/evals.ts` mapped to internal wrappers that
       behave like before for the data-array describeEval path.
       Marked `@deprecated`. Remove next minor.

## Harness adapter

- [ ] 9. `src/harness/index.ts`: extend `HarnessContext` with
       `setup(script: string): Promise<void>` that re-seeds the
       case workspace. `caseData.setup` path stays for compat.
- [ ] 10. Verify `run.session.outputText` populated from agent
        result so `expect(result.session.outputText).toMatch(...)`
        works in the new files.

## Eval-gen: assertion plan + renderer

- [ ] 11. Define the `AssertionPlan` / `CasePlan` / `Assertion`
        types in `src/authoring/phases/eval-gen-types.ts`.
- [ ] 12. New module `src/authoring/phases/eval-gen-render.ts`:
        function `renderEvalFile(entryId, plan): string`. Emits
        imports, `skillRoot`, judge declarations, `describeEval`
        with `it()` blocks. Pure function, unit-testable.
- [ ] 13. Renderer per-assertion mapping:
        - `output-matches` → `expect(result.session.outputText).toMatch(new RegExp(...))`
        - `output-contains` / `output-not-contains` → `toContain` / `not.toContain`
        - `output-match-object` → `expect(result.output).toMatchObject(...)`
        - `tool-calls` → `expect(toolCalls(result.session).map(c=>c.name)).toEqual(...)` etc.
        - `judge` → `await expect(result).toSatisfyJudge(<JudgeName>)`
- [ ] 14. Renderer rejects suspicious patterns: bare `/[A-Z]+/`
        without `\b`, empty regex, regex that matches the input
        verbatim. Each rejection bubbles back as a parse-equivalent
        retry signal so eval-gen can re-prompt.
- [ ] 15. Update `src/authoring/prompts/eval-gen.ts`: rewrite to
        teach the assertion-plan JSON, with two worked examples
        (positive + must_not). Drop the old "expectedContains /
        criteria" guidance.
- [ ] 16. Update `src/authoring/phases/eval-gen.ts`: change the
        validator from `validateCase` to `validatePlan`. The
        `submitAiJob` and parse-retry/diagnostic plumbing stay
        unchanged. After validation, call `renderEvalFile`
        from #12 to produce file content.
- [ ] 17. Drop `EVAL_TS_BANNER` reference to "Generated initially
        from spec.yaml" wording where it talks about data arrays;
        keep the durable-after-generation banner text otherwise
        unchanged.

## Reporter (vitest-runner)

- [ ] 18. `src/eval/vitest-runner.ts`:
        `assertionToCaseResult` reads `task.meta.judges` (new
        channel) in addition to `task.meta.eval.scores` (compat).
        Primary judge picked as first named, non-null result.
- [ ] 19. Update `tests_behavior` extraction: read from
        `task.meta.tests_behavior` (already the path).

## Self-tests / fixtures

- [ ] 20. Rewrite `src/vitest-evals/describe-eval.test.ts` (or
        add a new file) covering both the data-array compat path
        and the new callback path. Snapshot the rendered output
        of `renderEvalFile` for one positive and one must_not
        plan.
- [ ] 21. Update any in-repo `.eval.ts` self-test fixtures to the
        new shape so dogfooding regenerated files matches what
        users will see.

## Validation

- [ ] 22. `npm run typecheck`
- [ ] 23. `npm run check`
- [ ] 24. `openspec validate 2026-05-01-harness-first-evals --strict`
- [ ] 25. Smoke: `skillet create` against a small description,
        confirm generated `.eval.ts` files use callback form,
        named judges, real `expect()` calls.
- [ ] 26. Smoke: `skillet eval` against the regenerated skill
        passes (or fails for legitimate reasons), reporter
        surfaces named-judge rationale on failure.
- [ ] 27. Boundary: regenerate a 10–20 behavior skill from
        `warden-skills` and review by hand: count of cases using
        a judge vs deterministic-only. Aim ≥50% deterministic-
        only or deterministic-plus-judge.
