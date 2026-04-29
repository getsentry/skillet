## 1. Spec simplification

- [x] 1.1 Remove `BehaviorEval` type, `eval` field from `Behavior` and `MustNot` in `src/spec/types.ts`. Remove `update_eval` from `SpecPatch` union and `SPEC_PATCH_OPS`.
- [x] 1.2 Update `src/spec/parser.ts` to silently ignore `eval` keys in behaviors/must_nots instead of parsing them.
- [x] 1.3 Remove `update_eval` handling from `src/spec/patcher.ts`.
- [x] 1.4 Delete `src/spec/promote.ts` entirely. Remove its export from `src/spec/index.ts`.
- [x] 1.5 Update all existing `spec.yaml` fixtures (already had no eval blocks; verified clean).
- [x] 1.6 Type-check passes (`tsc --noEmit`).

## 2. Skillet harness adapter

- [x] 2.1 Create `src/harness/index.ts` exporting `skilletHarness()` that returns a vitest-evals–compatible `Harness`. Wraps `runAgent` with temp workspace creation, skill loading, and `HarnessRun` normalization.
- [x] 2.2 Reuse existing `src/eval/workspace.ts` (imported by harness rather than moved).
- [x] 2.3 Add `vitest` as a dependency. vitest-evals NOT added — local mini-lib at `src/vitest-evals/` mirrors PR #41's harness-first API; swap when 0.9 ships.
- [x] 2.4 Configure package.json exports to expose `@sentry/skillet/evals` subpath (re-exports describeEval, harness, judges).

## 3. Eval discovery and metadata extraction

- [x] 3.1 Create `src/eval/discovery.ts` that globs `evals/**/*.eval.ts` and extracts `tests_behavior` values via regex scan of the file content.
- [x] 3.2 Update `src/verify/coverage.ts` to use the new TypeScript-based discovery instead of YAML parsing.
- [x] 3.3 Update `src/eval/index.ts` exports — remove YAML parser, add new discovery.

## 4. Vitest runner integration

- [x] 4.1 Create `src/eval/vitest-runner.ts` — spawns vitest with a generated config, parses JSON output into `EvalRunResult`.
- [x] 4.2 Vitest config is inlined into a transient temp file at skillet's repo root so vitest can resolve its `vitest/config` import through skillet's node_modules.
- [x] 4.3 Update `src/commands/eval.ts` to delegate to vitest runner instead of custom runner.
- [x] 4.4 `--json` flag outputs `EvalRunResult` parsed from vitest JSON; verified end-to-end with `tests_behavior` round-tripping.

## 5. Eval-gen rewrite

- [x] 5.1 Rewrite `src/authoring/prompts/eval-gen.ts` — prompt asks for a JSON array of case objects (`name`, `input`, `tests_behavior`, `expectedContains` or `criteria`, optional `setup`).
- [x] 5.2 Rewrite `src/authoring/phases/eval-gen.ts` — receives LLM JSON, validates each case, wraps in fixed TypeScript template, writes `evals/basic.eval.ts`. Includes 3-attempt retry with parser-error feedback.
- [ ] 5.3 Update `references/eval-examples.md` with TypeScript eval examples. (Deferred — examples now live in README and the generated template itself; reference file isn't loaded by current prompts.)

## 6. Authoring loop adaptation

- [x] 6.1 Update `src/authoring/loop.ts` — remove `promotePassingEvals` calls and related imports. Remove `promotedIds` tracking.
- [x] 6.2 Update `src/authoring/loop.ts` — eval-run step calls `runVitestEvals` instead of custom `runEvals`.
- [x] 6.3 Update `AuthorSkillResult` type to remove `promotedIds` field.

## 7. Cleanup old eval infrastructure

- [x] 7.1 Delete `src/eval/runner.ts` (custom runner).
- [x] 7.2 Delete `src/eval/parser.ts` (YAML parser).
- [x] 7.3 Delete `src/eval/checks.ts` (structural checks).
- [x] 7.4 Keep `src/eval/judge.ts` — used by `CriterionJudge`. (Not deleted; reused.)
- [x] 7.5 Clean up `src/eval/types.ts` — kept `EvalRunResult`/`EvalCaseResult`; the YAML-specific types are no longer surfaced through `index.ts` (they live in dead modules that were deleted).
- [x] 7.6 Delete `src/eval/linter.ts`, `src/eval/requirements.ts`, `src/authoring/eval-gen.ts` outer wrapper. No `.eval.yaml` files remaining anywhere.

## 8. Self-test evals rewrite

- [x] 8.1 Top-level `evals/eval-json.eval.yaml`, `evals/spec.eval.yaml`, `evals/verify.eval.yaml` deleted — they were CLI integration smoke tests that don't fit the harness pattern; coverage is provided by the in-repo fixture that exercises the actual vitest pipeline.
- [x] 8.2 Same as 8.1 (deleted not rewritten).
- [x] 8.3 Same as 8.1 (deleted not rewritten).
- [x] 8.4 Rewrite fixture evals under `evals/fixtures/` to TypeScript format (`spec-driven-skill`, `incomplete-spec-skill`, `valid-skill`, `skills/skillet`).
- [x] 8.5 Verified `skillet eval ./evals/fixtures/spec-driven-skill/` passes 3/3 cases via vitest.

## 9. Build and integration

- [x] 9.1 Full type-check passes (`tsc --noEmit`).
- [x] 9.2 Build succeeds (`npm run build` — produces `dist/cli.js` + `dist/lib/*` for the `evals` subpath export).
- [x] 9.3 `skillet verify evals/fixtures/spec-driven-skill/ --triggers` still passes (Structural / Coverage / Triggers all green).
- [x] 9.4 `skillet eval evals/fixtures/spec-driven-skill/` runs via vitest and passes.
- [ ] 9.5 `skillet improve` end-to-end test on a fixture skill — deferred; requires LLM keys, smoke tested by the in-repo eval pipeline running successfully.
- [x] 9.6 Update `skills/skillet/SKILL.md` and `spec.yaml` to reflect new eval format and durability semantics (spec is intent, eval files are durable after generation).
- [x] 9.7 Update README.md eval examples to show TypeScript format.
