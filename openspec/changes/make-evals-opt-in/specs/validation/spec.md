## MODIFIED Requirements

### Requirement: Coverage validation

Validation SHALL cross-check a structurally valid exact-case `spec.md` against any cases present in `evals/cases/`: unknown `behavior` references are errors, fixture slugs referenced by cases must exist, and behaviors without eval cases are valid without diagnostics. When `spec.md` is missing or contains structural errors, case schema validation SHALL still run but behavior linkage SHALL be reported as not checked.

#### Scenario: Full-skill validation summary

- **WHEN** `skillet validate` runs on a skill with a valid spec and SKILL.md but no eval cases
- **THEN** output reports the core skill as valid with zero optional eval cases and no missing-coverage warning

#### Scenario: Partial optional eval suite

- **WHEN** `skillet validate` runs on a skill whose valid cases cover only selected spec behaviors
- **THEN** it validates each case's schema, behavior reference, and fixture without requiring cases for the remaining behaviors

#### Scenario: Existing skill has no Skillet spec

- **WHEN** `skillet validate` runs on `SKILL.md` plus uppercase legacy `SPEC.md` with no lowercase `spec.md`
- **THEN** validation reports the missing Skillet spec, reports the number and schema state of any eval cases, reports behavior linkage as not checked, and returns `coverageChecked: false` in JSON

#### Scenario: Invalid spec cannot define eval linkage

- **WHEN** exact-case `spec.md` exists but has structural errors that prevent a valid behavior contract
- **THEN** eval case schema checks still run and behavior linkage is reported as not checked rather than `ok`
