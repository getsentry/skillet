## 1. Spec simplification

- [ ] 1.1 Remove `BehaviorEval` type, `eval` field from `Behavior` and `MustNot` in `src/spec/types.ts`. Remove `update_eval` from `SpecPatch` union and `SPEC_PATCH_OPS`.
- [ ] 1.2 Update `src/spec/parser.ts` to silently ignore `eval` keys in behaviors/must_nots instead of parsing them.
- [ ] 1.3 Remove `update_eval` handling from `src/spec/patcher.ts`.
- [ ] 1.4 Delete `src/spec/promote.ts` entirely. Remove its export from `src/spec/index.ts`.
- [ ] 1.5 Update all existing `spec.yaml` fixtures (`evals/fixtures/spec-driven-skill/spec.yaml`, `skills/skillet/spec.yaml`) to remove `eval` blocks.
- [ ] 1.6 Type-check passes (`tsc --noEmit`).

## 2. Skillet harness adapter

- [ ] 2.1 Create `src/harness/index.ts` exporting `skilletHarness()` that returns a vitest-evals–compatible `Harness`. Wraps `runAgent` with temp workspace creation, skill loading, and `HarnessRun` normalization.
- [ ] 2.2 Move workspace logic from `src/eval/workspace.ts` to `src/harness/workspace.ts` (or reuse in-place with re-export).
- [ ] 2.3 Add `vitest` and `vitest-evals` as peer/dev dependencies in `package.json`.
- [ ] 2.4 Configure package.json exports to expose `@sentry/skillet/harness` subpath.

## 3. Eval discovery and metadata extraction

- [ ] 3.1 Create `src/eval/discovery.ts` that globs `evals/**/*.eval.ts` and extracts `tests_behavior` values via regex scan of the file content.
- [ ] 3.2 Update `src/verify/coverage.ts` to use the new TypeScript-based discovery instead of YAML parsing.
- [ ] 3.3 Update `src/eval/index.ts` exports — remove YAML parser, add new discovery.

## 4. Vitest runner integration

- [ ] 4.1 Create `src/eval/vitest-runner.ts` — spawns vitest with a generated config, parses JSON output into `EvalRunResult`.
- [ ] 4.2 Create a vitest config template that sets test root to skill's `evals/`, enables JSON reporter.
- [ ] 4.3 Update `src/commands/eval.ts` to delegate to vitest runner instead of custom runner.
- [ ] 4.4 Update `src/commands/eval.ts` `--json` flag to output `EvalRunResult` parsed from vitest JSON.

## 5. Eval-gen rewrite

- [ ] 5.1 Rewrite `src/authoring/prompts/eval-gen.ts` — prompt now asks LLM for a JSON array of case objects (`name`, `input`, `tests_behavior`, `expectedContains` or `criteria`, optional `setup`).
- [ ] 5.2 Rewrite `src/authoring/phases/eval-gen.ts` — receives LLM JSON output, wraps it in TypeScript template (imports, `describeEval`, `skilletHarness`, test function), writes `evals/basic.eval.ts`.
- [ ] 5.3 Update `references/eval-examples.md` with TypeScript eval examples.

## 6. Authoring loop adaptation

- [ ] 6.1 Update `src/authoring/loop.ts` — remove `promotePassingEvals` calls and related imports. Remove `promotedIds` tracking.
- [ ] 6.2 Update `src/authoring/loop.ts` — eval-run step calls vitest runner (`src/eval/vitest-runner.ts`) instead of custom `runEvals`.
- [ ] 6.3 Update `AuthorSkillResult` type to remove `promotedIds` field.

## 7. Cleanup old eval infrastructure

- [ ] 7.1 Delete `src/eval/runner.ts` (custom runner).
- [ ] 7.2 Delete `src/eval/parser.ts` (YAML parser).
- [ ] 7.3 Delete `src/eval/checks.ts` (structural checks).
- [ ] 7.4 Delete `src/eval/judge.ts` (LLM judge — vitest-evals judges replace it).
- [ ] 7.5 Clean up `src/eval/types.ts` — keep `EvalRunResult`, `EvalCaseResult`; remove YAML-specific types (`EvalCase`, `EvalFile`, check types).
- [ ] 7.6 Delete `evals/validate.eval.yaml` if still present. Remove any remaining `.eval.yaml` fixtures.

## 8. Self-test evals rewrite

- [ ] 8.1 Rewrite `evals/eval-json.eval.yaml` → `evals/eval-json.eval.ts` using new format.
- [ ] 8.2 Rewrite `evals/spec.eval.yaml` → `evals/spec.eval.ts`.
- [ ] 8.3 Rewrite `evals/verify.eval.yaml` → `evals/verify.eval.ts`.
- [ ] 8.4 Rewrite fixture evals under `evals/fixtures/` to TypeScript format.
- [ ] 8.5 Verify all self-test evals pass with `skillet eval`.

## 9. Build and integration

- [ ] 9.1 Full type-check passes (`tsc --noEmit`).
- [ ] 9.2 Build succeeds (`npm run build`).
- [ ] 9.3 `skillet verify evals/fixtures/spec-driven-skill/ --triggers` still passes.
- [ ] 9.4 `skillet eval evals/fixtures/spec-driven-skill/` runs via vitest and passes.
- [ ] 9.5 `skillet improve` end-to-end test on a fixture skill completes.
- [ ] 9.6 Update `skills/skillet/SKILL.md` to reflect new eval format in instructions.
- [ ] 9.7 Update README.md eval examples to show TypeScript format.
