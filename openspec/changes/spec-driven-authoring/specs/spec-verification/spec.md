## ADDED Requirements

### Requirement: Layered verification

The system SHALL provide a `verify(skillPath, opts)` function and a `skillet verify` command that runs the following layers in order, short-circuiting on the first failing layer so cheap checks fail before more expensive ones run:

1. **Structural** — each file in the skill directory parses and has its required fields. Covers `spec.yaml` (required: `managed_by`, `spec_version`, `name`, `intent`, ≥1 entry in `triggers.should`; behavior/must_not IDs unique; well-formed `eval` blocks), `SKILL.md` (frontmatter parse + required `name`/`description`), and `evals/*.eval.yaml` (parse + required `name`/`turns` per case). No LLM. Subsumes the per-file lint that the removed `validation` capability provided.
2. **Cross-artifact coverage** — every behavior and must_not ID in the spec has at least one eval case with matching `tests_behavior`; no orphan `tests_behavior` references; SKILL.md `name` matches spec `name`. No LLM.
3. **Per-behavior results** — when run results are supplied, every behavior has at least one passing case. No LLM.
4. **Semantic** — when `--semantic` is opted into, an LLM judge confirms SKILL.md encodes each behavior's intent.

#### Scenario: Layer 1 short-circuits later layers
- **WHEN** `spec.yaml` fails to parse or is missing a required field
- **THEN** the structural layer reports the error and the cross-artifact / results / semantic layers are not run

#### Scenario: Layer 2 runs after layer 1 passes
- **WHEN** the structural layer passes
- **THEN** the cross-artifact layer runs and reports per-behavior coverage status

#### Scenario: Layer 3 only runs when results provided
- **WHEN** verify is invoked without run results (no prior eval execution context, no `--with-run` argument)
- **THEN** layer 3 is skipped and the report indicates "results layer not evaluated"

#### Scenario: Layer 4 requires explicit opt-in
- **WHEN** verify is invoked without `--semantic`
- **THEN** the semantic layer is not run and no LLM call is made

### Requirement: Coverage verification

The system SHALL provide a `verifyCoverage(spec, evalFiles)` function that checks every behavior and must_not in `spec.yaml` has at least one eval case with a matching `tests_behavior` field. The function SHALL NOT call any LLM. The function SHALL return a structured `CoverageReport` listing covered IDs, uncovered IDs, and orphan eval cases (cases whose `tests_behavior` references no behavior or must_not).

#### Scenario: All behaviors covered
- **WHEN** every behavior and must_not ID has ≥1 eval case with matching `tests_behavior`
- **THEN** the report returns `covered = [...all ids...]`, `uncovered = []`, `orphans = []` and the overall `ok` field is `true`

#### Scenario: Behavior without an eval case
- **WHEN** a behavior or must_not in the spec has no eval case referencing its `id`
- **THEN** the report lists the ID under `uncovered` and `ok` is `false`

#### Scenario: Eval case references unknown ID
- **WHEN** an eval case has `tests_behavior: foo` and the spec has no behavior or must_not with that ID
- **THEN** the report lists the case under `orphans` with the unknown ID and `ok` is `false`

#### Scenario: No spec present
- **WHEN** `verifyCoverage` is called with no spec argument or a null spec
- **THEN** the function returns a report with `ok: false` and a single error explaining that spec-driven verification requires a spec

### Requirement: Result verification

The system SHALL provide a `verifyResults(spec, evalRunResult)` function that, given a spec and an `EvalRunResult` from a prior eval execution, groups results by `tests_behavior` and returns a `ResultsReport` with per-behavior verdicts: `covered+passing`, `covered+failing`, `covered+skipped`, or `uncovered`. The function SHALL NOT call any LLM.

#### Scenario: Every behavior has a passing case
- **WHEN** every behavior and must_not in the spec has ≥1 eval case in `EvalRunResult` with status `pass`
- **THEN** every entry in the report's `behaviors` map is `covered+passing` and `ok` is `true`

#### Scenario: Behavior has only failing cases
- **WHEN** a behavior's only eval case has status `fail` or `error`
- **THEN** the report lists the behavior as `covered+failing` and `ok` is `false`

#### Scenario: Behavior has only skipped cases
- **WHEN** all of a behavior's cases are skipped (e.g., due to `requires` not satisfied)
- **THEN** the report lists the behavior as `covered+skipped` (treated as not-yet-known, distinct from `uncovered`) and `ok` is `false`

#### Scenario: Behavior has no cases in the run
- **WHEN** the spec contains a behavior with no matching `tests_behavior` in any eval case
- **THEN** the report lists the behavior as `uncovered` and `ok` is `false`

#### Scenario: Behavior has multiple cases, mixed results
- **WHEN** a behavior has multiple eval cases and at least one passes
- **THEN** the report lists the behavior as `covered+passing` regardless of other cases' statuses

### Requirement: Semantic verification (opt-in)

The system SHALL provide a `verifySemantic(spec, skillMd, judgeModel)` function that uses an LLM judge to check whether the SKILL.md content encodes each behavior and must_not from the spec. The function SHALL return a `SemanticReport` with per-behavior verdicts (`encoded` / `partial` / `missing`) and reasoning strings. This function is opt-in and not invoked by the default authoring loop.

#### Scenario: SKILL.md encodes every behavior
- **WHEN** the LLM judge finds that each spec behavior and must_not is reflected in the SKILL.md content
- **THEN** every verdict is `encoded` and `ok` is `true`

#### Scenario: SKILL.md is missing a behavior
- **WHEN** the LLM judge finds that a spec behavior is not reflected anywhere in SKILL.md
- **THEN** the verdict for that behavior is `missing` with a reasoning string and `ok` is `false`

#### Scenario: SKILL.md partially encodes a behavior
- **WHEN** the LLM judge finds that a behavior is referenced but with weakened or incomplete wording
- **THEN** the verdict is `partial` with reasoning explaining what is missing

#### Scenario: Semantic check is never automatic
- **WHEN** the authoring loop runs without an explicit `--semantic` flag
- **THEN** `verifySemantic` is not invoked and no judge call is made for SKILL.md coverage

### Requirement: Verify in the iteration loop

The authoring loop SHALL run `verifyCoverage` immediately after `generate` and `verifyResults` immediately after eval execution. Loop termination SHALL be conditioned on `verifyResults.ok` rather than on raw eval pass/fail counts.

#### Scenario: Coverage gap caught after generate
- **WHEN** `verifyCoverage` returns `ok: false` after `generate` (eval-gen produced fewer cases than there are behaviors)
- **THEN** the loop skips eval execution for the iteration, feeds the coverage gaps to the assessment phase, and continues

#### Scenario: Per-behavior result is the success condition
- **WHEN** raw eval results show `summary.fail === 0` but `verifyResults` reports an uncovered or skipped-only behavior
- **THEN** the loop does not terminate; the uncovered/skipped behaviors flow to assessment

#### Scenario: Loop terminates on per-behavior all-green
- **WHEN** `verifyResults.ok` is `true` (every behavior has a passing case) and there are no orphan cases
- **THEN** the loop terminates with `success: true`

### Requirement: Verification feeds assessment

The assessment phase SHALL receive verification reports alongside eval results so that missing-coverage and failing-coverage failures produce distinct, targeted spec patches.

#### Scenario: Missing coverage produces update_eval patch
- **WHEN** `verifyCoverage` reports behavior `foo` as `uncovered`
- **THEN** the assessment phase is prompted to produce an `update_eval` patch (or `add_behavior` if the behavior was incorrectly removed) for `foo`

#### Scenario: Failing coverage produces update_behavior or update_eval patch
- **WHEN** `verifyResults` reports behavior `foo` as `covered+failing`
- **THEN** the assessment phase is prompted to produce a patch that either tightens the behavior statement (`update_behavior`) or fixes the eval (`update_eval`) based on the judge reasoning and case detail

#### Scenario: Orphan eval case produces remove or rebind patch
- **WHEN** `verifyCoverage` reports an orphan eval case (referencing an unknown `tests_behavior`)
- **THEN** the assessment phase is prompted to either reject the orphan (regen will drop it) or, if the behavior was renamed mid-iteration, produce a patch to restore the missing ID
