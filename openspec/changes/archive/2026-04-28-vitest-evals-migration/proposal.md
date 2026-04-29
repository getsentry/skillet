## Why

Skillet's eval format drifted from the original intent. Evals are custom YAML files with a custom runner, but the plan was always to align with vitest-evals (`evals/*.eval.ts` using `describeEval`, harnesses, judges, and standard vitest `expect`). vitest-evals is about to land (getsentry/vitest-evals#41). Meanwhile, `spec.yaml` carries `BehaviorEval` blocks (setup, prompt, expect, criteria) that duplicate what should live in eval files — the spec became an eval template instead of staying a simple intent document. Two corrections: eval files become TypeScript that vitest-evals runs natively, and the spec drops eval blocks so it's just behaviors-as-strings.

## What Changes

- **BREAKING** Eval file format changes from `evals/*.eval.yaml` to `evals/*.eval.ts`. Existing YAML evals stop working; `skillet eval` runs vitest instead of the custom runner.
- **BREAKING** `BehaviorEval` type removed from `spec.yaml` schema. The `eval` field on `Behavior` and `MustNot` entries is dropped. Behaviors become `{id, statement, rationale?}` only. Existing specs with `eval` blocks get the field silently ignored (parser strips it) rather than erroring.
- **MODIFIED** Eval-gen phase produces `evals/*.eval.ts` files importing from `vitest-evals` instead of writing YAML. One file per eval or one file with multiple `describeEval` blocks — follows vitest-evals conventions.
- **MODIFIED** `skillet eval` command delegates to vitest (via `vitest run evals/`) instead of using the custom runner. Result parsing reads vitest-evals normalized output.
- **MODIFIED** Eval parser and discovery switch from YAML glob to `.eval.ts` glob. Coverage/results verify layers extract `tests_behavior` metadata from the TypeScript files (comment annotation or exported constant).
- **MODIFIED** Promote phase (`promotePassingEvals`) removed or simplified — with no `eval` block in the spec, there's nothing to promote back into.
- **REMOVED** Custom eval runner (`src/eval/runner.ts` agent-loop execution). Replaced by vitest.
- **REMOVED** Custom eval YAML parser (`src/eval/parser.ts` YAML parsing). Replaced by TypeScript import or AST-based metadata extraction.
- **MODIFIED** All self-test fixtures and evals rewritten in the new format.

## Capabilities

### New Capabilities
- `vitest-eval-runner`: The vitest-based eval execution layer. Owns the vitest config, result normalization from vitest-evals output into skillet's `EvalRunResult` shape, and the harness adapter that loads a skill into a vitest-evals harness.

### Modified Capabilities
- `eval-format`: File format changes from YAML to TypeScript. Discovery glob changes. Case metadata (`tests_behavior`) expressed differently.
- `skill-spec`: `BehaviorEval` type and `eval` field on behaviors/must_nots removed from schema. Parser ignores legacy `eval` blocks.
- `skill-authoring`: Eval-gen phase produces TypeScript. Promote phase removed. Improve loop reads vitest results instead of custom runner results.
- `cli`: `skillet eval` delegates to vitest. No more custom runner invocation.

### Removed Capabilities
- `validation`: The YAML-specific eval lint rules are no longer applicable. Structural verification of eval files adapts to TypeScript.

## Impact

- New runtime dependency: `vitest` and `vitest-evals` (peer or bundled).
- `src/eval/` module: runner.ts, parser.ts, types.ts gutted and replaced with vitest adapter.
- `src/spec/types.ts`: `BehaviorEval` type removed; `Behavior.eval` and `MustNot.eval` fields removed.
- `src/spec/parser.ts`, `src/spec/patcher.ts`: Strip eval-related parsing and patch ops (`update_eval`).
- `src/spec/promote.ts`: Removed entirely.
- `src/authoring/phases/eval-gen.ts` and `src/authoring/prompts/eval-gen.ts`: Rewritten to produce TypeScript.
- `src/verify/coverage.ts`, `src/verify/results.ts`: Adapt to read metadata from `.eval.ts` files.
- `src/commands/eval.ts`: Delegates to vitest.
- All `evals/` directories (fixtures and self-tests): Rewritten.
- `references/eval-examples.md`: Updated with TypeScript examples.
