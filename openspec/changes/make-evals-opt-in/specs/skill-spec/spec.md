## MODIFIED Requirements

### Requirement: spec.md as source of truth

Each skill SHALL have a `spec.md` at its root that codifies intent in plain markdown. It is the source of truth from which SKILL.md is derived. Agents regenerate SKILL.md from `spec.md`; humans review intent by reading `spec.md` diffs. Optional eval cases MAY be derived from selected spec scenarios when the user chooses to evaluate the skill.

#### Scenario: Spec present drives status

- **WHEN** `skillet status` runs in a skill directory containing `spec.md`
- **THEN** SKILL.md is reported relative to the spec as present, missing, or stale
- **AND** any existing eval case count is reported as optional information

#### Scenario: Spec missing

- **WHEN** a skill directory has a SKILL.md but no `spec.md`
- **THEN** `skillet status` reports the spec as the missing next artifact and points at the agent-driven import workflow

### Requirement: Behavior-to-eval coverage

The system SHALL report the descriptive mapping between behaviors in `spec.md` and any optional eval cases in `evals/cases/`. A behavior with no eval case SHALL be valid and SHALL NOT emit a missing-coverage diagnostic. An eval case referencing an unknown behavior or constraint identifier SHALL be an error.

#### Scenario: Behavior has no eval

- **WHEN** `skillet validate` runs and behavior `commit-message-format` has no eval case with `behavior: commit-message-format`
- **THEN** validation emits no warning or error for the missing case

#### Scenario: Partial eval suite

- **WHEN** a skill has eval cases for only selected behaviors
- **THEN** validation accepts the uncovered behaviors while still reporting the existing behavior-to-case mapping

#### Scenario: Orphan eval case errors

- **WHEN** an eval case references `behavior: does-not-exist`
- **THEN** validation fails with an error naming the case file and the unknown identifier
