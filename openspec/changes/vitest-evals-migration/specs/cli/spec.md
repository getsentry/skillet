## MODIFIED Requirements

### Requirement: eval command delegates to vitest

`skillet eval [path] [--json]` SHALL spawn vitest to run the skill's eval files. The `--json` flag SHALL output skillet's `EvalRunResult` JSON (parsed from vitest's JSON reporter output). Without `--json`, vitest's default reporter output is shown.

#### Scenario: eval runs vitest
- **WHEN** `skillet eval ./my-skill` is run
- **THEN** vitest executes `evals/*.eval.ts` in the skill directory and output is displayed

#### Scenario: eval --json produces EvalRunResult
- **WHEN** `skillet eval ./my-skill --json` is run
- **THEN** stdout contains a JSON object with `cases` and `summary` fields matching `EvalRunResult`

#### Scenario: eval with no eval files
- **WHEN** `skillet eval ./my-skill` is run on a skill with no `evals/*.eval.ts` files
- **THEN** the command reports zero cases and exits cleanly

#### Scenario: eval exit code reflects pass/fail
- **WHEN** any eval case fails
- **THEN** `skillet eval` exits with code 1

## REMOVED Requirements

### Requirement: validate command
**Reason**: Already removed in spec-driven-authoring change. Confirming removal stands — `validate` is not re-introduced.
**Migration**: Use `skillet verify` instead.
