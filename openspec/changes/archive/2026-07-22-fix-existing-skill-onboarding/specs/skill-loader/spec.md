# Skill Loader Delta

## MODIFIED Requirements

### Requirement: Skill Root Discovery

The system SHALL locate the skill root by finding the nearest directory containing an exact-case `spec.md` or `SKILL.md`, searching from the provided path upward. Uppercase `SPEC.md` SHALL NOT satisfy the active `spec.md` requirement on case-insensitive filesystems.

#### Scenario: Path is the skill directory
- GIVEN `skillet eval ./my-skill`
- WHEN `./my-skill/spec.md` or `./my-skill/SKILL.md` exists with exact casing
- THEN the skill root is `./my-skill`

#### Scenario: Path is inside the skill directory
- GIVEN `skillet eval ./my-skill/evals`
- WHEN `./my-skill/spec.md` or `./my-skill/SKILL.md` exists with exact casing
- THEN the skill root is `./my-skill`

#### Scenario: Uppercase legacy spec is not active
- **WHEN** a skill directory contains `SKILL.md` and uppercase `SPEC.md` but no exact lowercase `spec.md`
- **THEN** the directory is found through `SKILL.md`, `SPEC.md` is reported as legacy, and its contents are not parsed as the Skillet spec

#### Scenario: No skill found
- GIVEN a path with no exact-case `spec.md` or `SKILL.md` in it or any parent
- WHEN discovery runs
- THEN the system reports that no skill was found at or above the path and exits with code 1

### Requirement: Skill Directory Structure

A skill directory SHALL contain exact-case `spec.md` (source of truth), `SKILL.md` (agent-rendered), optional `references/*.md`, and `evals/` with `cases/*.yaml` and `fixtures/<slug>/`. Skillet commands locate the skill root by finding the nearest ancestor directory containing exact-case `spec.md` or `SKILL.md`.

#### Scenario: Complete skill layout
- **WHEN** `skillet status` runs on a directory with exact-case `spec.md`, `SKILL.md`, and `evals/cases/`
- **THEN** all artifacts are discovered and reported without configuration

#### Scenario: Legacy YAML skill detected
- **WHEN** a directory contains `SKILL.md` and legacy `spec.yaml` but no `spec.md`
- **THEN** status reports the legacy marker and directs the agent to derive `spec.md`

#### Scenario: Legacy uppercase Markdown spec detected
- **WHEN** a directory contains `SKILL.md` and uppercase `SPEC.md` but no exact lowercase `spec.md`
- **THEN** status reports `SPEC.md` as a non-Skillet legacy document and directs the agent to preserve or rename it before deriving lowercase `spec.md`
