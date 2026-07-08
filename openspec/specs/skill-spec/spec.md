# skill-spec Specification

## Purpose
TBD - created by archiving change thin-cli-redesign. Update Purpose after archive.
## Requirements
### Requirement: spec.md as source of truth

Each skill SHALL have a `spec.md` at its root that codifies intent in plain markdown. It is the source of truth from which SKILL.md and eval cases are derived. Agents regenerate SKILL.md from `spec.md`; humans review intent by reading `spec.md` diffs.

#### Scenario: Spec present drives status
- **WHEN** `skillet status` runs in a skill directory containing `spec.md`
- **THEN** SKILL.md and eval artifacts are reported relative to the spec (present, missing, or stale)

#### Scenario: Spec missing
- **WHEN** a skill directory has a SKILL.md but no `spec.md`
- **THEN** `skillet status` reports the spec as the missing next artifact and points at the agent-driven import workflow

### Requirement: Spec grammar

`spec.md` SHALL use a small strict grammar: `# <Skill Name>` title, `## Intent` prose, `## Triggers` with `- **SHOULD**` / `- **SHOULD NOT**` bullets, `## Behaviors` containing `### Behavior: <name>` blocks each with normative text (SHALL/MUST) and at least one `#### Scenario: <name>` with `- **WHEN**` / `- **THEN**` bullets, and an optional `## Constraints` section with `### Constraint: <name>` blocks stating what the skill MUST NOT do.

#### Scenario: Valid spec parses
- **WHEN** a `spec.md` follows the grammar
- **THEN** `skillet validate` extracts the intent, triggers, behaviors with their scenarios, and constraints without errors

#### Scenario: Behavior without scenario rejected
- **WHEN** a `### Behavior:` block contains no `#### Scenario:` block
- **THEN** validation fails with an error naming the behavior and stating that every behavior requires at least one scenario

#### Scenario: Wrong heading depth rejected
- **WHEN** a scenario uses `###` instead of `####`
- **THEN** validation reports a structural error with the line number and the expected heading depth, rather than silently dropping the scenario

### Requirement: Behavior identifiers

Each behavior and constraint SHALL have a stable identifier derived by slugifying its name (lowercase, hyphens). Identifiers are the linkage keys used by eval cases and coverage reporting.

#### Scenario: Slug derivation
- **WHEN** a spec contains `### Behavior: Commit message format`
- **THEN** its identifier is `commit-message-format`

#### Scenario: Duplicate identifiers rejected
- **WHEN** two behaviors slugify to the same identifier
- **THEN** validation fails naming both behaviors

### Requirement: Behavior-to-eval coverage

The system SHALL report coverage between behaviors in `spec.md` and eval cases in `evals/cases/`. A behavior with no eval case referencing it is a warning; an eval case referencing an unknown behavior identifier is an error.

#### Scenario: Uncovered behavior warns
- **WHEN** `skillet validate` runs and behavior `commit-message-format` has no eval case with `behavior: commit-message-format`
- **THEN** validation emits a warning listing the uncovered behavior

#### Scenario: Orphan eval case errors
- **WHEN** an eval case references `behavior: does-not-exist`
- **THEN** validation fails with an error naming the case file and the unknown identifier

