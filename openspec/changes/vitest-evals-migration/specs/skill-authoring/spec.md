## MODIFIED Requirements

### Requirement: Eval generation produces TypeScript

The eval-gen phase SHALL produce `evals/basic.eval.ts` files using vitest-evals' `describeEval` API. Each spec behavior and must_not maps to one case in the `data` array. The generated file SHALL import `skilletHarness` from `@sentry/skillet/harness` and use it as the harness.

#### Scenario: Generated file is valid TypeScript
- **WHEN** eval-gen produces `evals/basic.eval.ts`
- **THEN** the file passes `tsc --noEmit` type checking

#### Scenario: Each behavior maps to one case
- **WHEN** a spec has 3 behaviors and 1 must_not
- **THEN** the generated `data` array has 4 entries, each with `tests_behavior` matching the behavior/must_not id

#### Scenario: Negative cases use judge criteria
- **WHEN** a must_not entry is converted to a case
- **THEN** the case uses `criteria` (judge-based assertion) rather than `expectedContains`, because negative cases are prone to input echo

#### Scenario: Setup scripts are included
- **WHEN** a behavior's rationale or statement implies workspace setup is needed (e.g., "review views.py")
- **THEN** the generated case includes a `setup` field with the shell script

### Requirement: Improve loop uses vitest

The improve loop SHALL run evals by invoking vitest (via `skillet eval --json`) instead of the custom runner. The vitest JSON output SHALL be parsed into `EvalRunResult` and fed to `verifyResults` unchanged.

#### Scenario: Loop runs vitest
- **WHEN** the improve loop reaches the eval-run step
- **THEN** it calls vitest via the eval command and receives structured results

#### Scenario: Loop feeds results to verify
- **WHEN** vitest results are parsed into `EvalRunResult`
- **THEN** `verifyResults(spec, evalRunResult)` produces per-behavior verdicts identical to the previous custom-runner path

### Requirement: Promote phase removed

The improve loop SHALL NOT promote passing eval cases back into `spec.yaml`. The `promotePassingEvals` function and its calls in the loop are removed.

#### Scenario: Spec unchanged after eval run
- **WHEN** an improve loop iteration runs evals and some pass
- **THEN** `spec.yaml` is not modified; only `SKILL.md` may be tuned

### Requirement: Eval-gen prompt rewrite

The eval-gen system prompt SHALL instruct the LLM to produce a JSON array of case objects (name, input, tests_behavior, expectedContains or criteria, optional setup). The surrounding TypeScript template (imports, describeEval, harness, test function) is NOT LLM-generated — it is templated by skillet and the LLM output is interpolated into the `data` array position.

#### Scenario: LLM produces data array only
- **WHEN** eval-gen runs
- **THEN** the LLM returns a JSON array of case objects; skillet wraps it in the TypeScript template

#### Scenario: Invalid LLM output
- **WHEN** the LLM returns malformed JSON
- **THEN** eval-gen retries (existing retry logic) and fails after max attempts with a clear error
