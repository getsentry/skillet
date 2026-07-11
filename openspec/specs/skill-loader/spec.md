# Skill Loader Specification

## Purpose

The skill loader locates a skill directory, parses SKILL.md frontmatter, and installs the skill into eval workspaces through each harness's native mechanism (`.claude/skills/` for claude, workspace AGENTS.md for codex, `skill_dir` for custom harnesses).
## Requirements
### Requirement: Skill Root Discovery

The system SHALL locate the skill root by finding the nearest directory containing `spec.md` or `SKILL.md`, searching from the provided path upward.

#### Scenario: Path is the skill directory
- GIVEN `skillet eval ./my-skill`
- WHEN `./my-skill/spec.md` (or SKILL.md) exists
- THEN the skill root is `./my-skill`

#### Scenario: Path is inside the skill directory
- GIVEN `skillet eval ./my-skill/evals`
- WHEN `./my-skill/spec.md` (or SKILL.md) exists
- THEN the skill root is `./my-skill`

#### Scenario: No skill found
- GIVEN a path with no `spec.md` or `SKILL.md` in it or any parent
- WHEN discovery runs
- THEN the system reports that no skill was found at or above the path and exits with code 1

### Requirement: Frontmatter Parsing

The system SHALL parse YAML frontmatter from `SKILL.md` to extract skill metadata.

#### Scenario: Standard frontmatter
- GIVEN a SKILL.md beginning with:
  ```
  ---
  name: commit
  description: Creates commits following Sentry conventions.
  ---
  ```
- WHEN parsed
- THEN `name` is "commit" and `description` is "Creates commits following Sentry conventions."

#### Scenario: No frontmatter
- GIVEN a SKILL.md with no `---` delimited frontmatter
- WHEN parsed
- THEN the entire file content is treated as the skill body
- AND name defaults to the directory name

### Requirement: Skill Directory Structure

A skill directory SHALL contain `spec.md` (source of truth), `SKILL.md` (agent-rendered), optional `references/*.md`, and `evals/` with `cases/*.yaml` and `fixtures/<slug>/`. Skillet commands locate the skill root by finding the nearest ancestor directory containing either `spec.md` or `SKILL.md`.

#### Scenario: Complete skill layout
- **WHEN** `skillet status` runs on a directory with spec.md, SKILL.md, and evals/cases/
- **THEN** all artifacts are discovered and reported without configuration

#### Scenario: Legacy skill detected
- **WHEN** a directory contains SKILL.md and a legacy `spec.yaml` but no `spec.md`
- **THEN** status reports the skill as legacy and points to the `/skillet:migrate` workflow

