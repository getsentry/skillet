# Validation Delta

## MODIFIED Requirements

### Requirement: Coverage validation

Validation SHALL cross-check a structurally valid exact-case `spec.md` against `evals/cases/`: unknown `behavior` references are errors; behaviors without any eval case are warnings; fixture slugs referenced by cases must exist. When `spec.md` is missing or contains structural errors, case schema validation SHALL still run but behavior coverage SHALL be reported as not checked.

#### Scenario: Full-skill validation summary
- **WHEN** `skillet validate` runs on a complete skill
- **THEN** output summarizes spec validity, SKILL.md frontmatter validity, case count and schema validity, and checked behavior coverage

#### Scenario: Existing skill has no Skillet spec
- **WHEN** `skillet validate` runs on `SKILL.md` plus uppercase legacy `SPEC.md` with no lowercase `spec.md`
- **THEN** validation reports the missing Skillet spec, reports the number and schema state of any eval cases, reports coverage as not checked, and returns `coverageChecked: false` in JSON

#### Scenario: Invalid spec cannot define coverage
- **WHEN** exact-case `spec.md` exists but has structural errors that prevent a valid behavior contract
- **THEN** eval case schema checks still run and coverage is reported as not checked rather than `ok`
