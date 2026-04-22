## ADDED Requirements

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

The system SHALL validate that all files matching `evals/**/*.eval.yaml` parse as valid YAML with the expected structure (`evals` array, each entry has `name` and `turns`).

#### Scenario: Valid eval files
- **WHEN** all eval YAML files parse correctly with required fields
- **THEN** validation passes with no eval file errors

#### Scenario: Malformed eval YAML
- **WHEN** an eval file contains invalid YAML syntax
- **THEN** validation reports an error with the file path and parse error

#### Scenario: Missing required eval fields
- **WHEN** an eval case is missing `name` or `turns`
- **THEN** validation reports an error identifying the case and missing field

### Requirement: No LLM calls in validation

Validation SHALL be a pure structural check with no LLM calls, completing in under 1 second for typical skill directories.

#### Scenario: Offline validation
- **WHEN** `skillkit validate` runs with no API keys configured
- **THEN** validation completes successfully without errors about missing providers
