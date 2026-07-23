# Validation Specification

## Purpose

Mechanical, no-LLM structural validation of skill artifacts: SKILL.md frontmatter and eval file structure.
## Requirements
### Requirement: SKILL.md structural validation

The system SHALL validate that SKILL.md has valid YAML frontmatter with required fields (`name`, `description`), that `name` is non-empty, and that `description` is non-empty with reasonable length.

#### Scenario: Valid SKILL.md
- **WHEN** SKILL.md has valid frontmatter with `name` and `description`
- **THEN** validation passes with no errors for the frontmatter checks

#### Scenario: Missing frontmatter
- **WHEN** SKILL.md has no YAML frontmatter delimiters
- **THEN** validation reports an error indicating missing frontmatter

#### Scenario: Missing required field
- **WHEN** SKILL.md frontmatter is missing `name` or `description`
- **THEN** validation reports an error identifying the missing field

### Requirement: Eval file structural validation

The system SHALL validate that every file in `evals/cases/*.yaml` parses as YAML and conforms to the case schema: required `behavior` and `prompt` fields, `checks` entries limited to the supported types (`file_exists`, `shell`, `judge`) with non-empty values, `trials` a positive integer if present, and `timeout` a positive number if present. Unknown fields are warnings, not errors.

#### Scenario: Malformed YAML
- **WHEN** a case file contains invalid YAML
- **THEN** validation reports the file path and parse error

#### Scenario: Unsupported check type
- **WHEN** a case contains `regex: "foo.*"` as a check
- **THEN** validation fails naming the file and listing the supported check types

### Requirement: No LLM calls in validation

Validation SHALL be a pure structural check with no LLM calls, completing in under 1 second for typical skill directories.

#### Scenario: Offline validation
- **WHEN** `skillet validate` runs with no API keys configured
- **THEN** validation completes successfully without errors about missing providers

### Requirement: Spec grammar validation

`skillet validate` SHALL validate `spec.md` against the skill-spec grammar: required sections present, every behavior has at least one scenario with WHEN/THEN bullets, heading depths are exact, and behavior identifiers are unique. Errors include the file, line, and a fix hint.

#### Scenario: Fix hint on error
- **WHEN** a spec has a `### Scenario:` (three hashes) under a behavior
- **THEN** the error message states scenarios require exactly four hashes and shows the offending line number

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

