# Validation Delta

## MODIFIED Requirements

### Requirement: Eval file structural validation

The system SHALL validate that every file in `evals/cases/*.yaml` parses as YAML and conforms to the case schema: required `behavior` and `prompt` fields, `checks` entries limited to the supported types (`file_exists`, `shell`, `judge`) with non-empty values, `trials` a positive integer if present, and `timeout` a positive number if present. Unknown fields are warnings, not errors.

#### Scenario: Malformed YAML
- **WHEN** a case file contains invalid YAML
- **THEN** validation reports the file path and parse error

#### Scenario: Unsupported check type
- **WHEN** a case contains `regex: "foo.*"` as a check
- **THEN** validation fails naming the file and listing the supported check types

## ADDED Requirements

### Requirement: Spec grammar validation

`skillet validate` SHALL validate `spec.md` against the skill-spec grammar: required sections present, every behavior has at least one scenario with WHEN/THEN bullets, heading depths are exact, and behavior identifiers are unique. Errors include the file, line, and a fix hint.

#### Scenario: Fix hint on error
- **WHEN** a spec has a `### Scenario:` (three hashes) under a behavior
- **THEN** the error message states scenarios require exactly four hashes and shows the offending line number

### Requirement: Coverage validation

Validation SHALL cross-check `spec.md` against `evals/cases/`: unknown `behavior` references are errors; behaviors without any eval case are warnings; fixture slugs referenced by cases must exist.

#### Scenario: Full-skill validation summary
- **WHEN** `skillet validate` runs on a complete skill
- **THEN** output summarizes spec validity, SKILL.md frontmatter validity, case validity, and behavior coverage in one report
