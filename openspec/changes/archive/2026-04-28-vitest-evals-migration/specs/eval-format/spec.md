## MODIFIED Requirements

### Requirement: Eval file format

Eval files SHALL be TypeScript files (`evals/*.eval.ts`) that use vitest-evals' `describeEval` API. Each file SHALL contain one `describeEval` block with a `data` array where each element represents one eval case. The YAML eval format (`evals/*.eval.yaml`) is no longer supported.

#### Scenario: TypeScript eval file structure
- **WHEN** skillet generates eval files from a spec
- **THEN** the output is `evals/basic.eval.ts` containing a `describeEval` call with `data`, `harness`, and `test` fields

#### Scenario: Case data includes behavior linkage
- **WHEN** a case in the `data` array corresponds to a spec behavior
- **THEN** the case object includes `tests_behavior: "<behavior-id>"` and `name: "<behavior-id>__<slug>"`

#### Scenario: YAML eval files are not discovered
- **WHEN** a skill directory contains `evals/*.eval.yaml` files but no `evals/*.eval.ts` files
- **THEN** `skillet eval` finds zero eval files and reports no cases

### Requirement: File discovery

The system SHALL discover eval files by globbing `evals/**/*.eval.ts` relative to the skill root. The previous `evals/**/*.eval.yaml` glob is removed.

#### Scenario: Standard eval directory with TypeScript
- **GIVEN** a skill at `my-skill/` with `my-skill/evals/basic.eval.ts`
- **WHEN** eval discovery runs
- **THEN** `basic.eval.ts` is discovered

#### Scenario: Mixed directory with YAML and TypeScript
- **GIVEN** a skill with both `evals/basic.eval.yaml` and `evals/basic.eval.ts`
- **WHEN** eval discovery runs
- **THEN** only `basic.eval.ts` is discovered; the YAML file is ignored

## REMOVED Requirements

### Requirement: Eval YAML case definition
**Reason**: Replaced by TypeScript eval files using vitest-evals `describeEval` API.
**Migration**: Re-run `skillet improve` on existing skills to regenerate evals in TypeScript format.

### Requirement: Eval result types
**Reason**: Result types are now defined by vitest-evals (`HarnessRun`, `NormalizedSession`). Skillet's `EvalRunResult` and `EvalCaseResult` remain as the internal normalized shape but are populated from vitest JSON output, not from the custom runner.
**Migration**: No action needed — the internal types are unchanged; only the population path changes.
