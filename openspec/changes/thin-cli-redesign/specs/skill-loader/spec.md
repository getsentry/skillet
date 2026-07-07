# Skill Loader Delta

## MODIFIED Requirements

### Requirement: Skill Directory Structure

A skill directory SHALL contain `spec.md` (source of truth), `SKILL.md` (agent-rendered), optional `references/*.md`, and `evals/` with `cases/*.yaml` and `fixtures/<slug>/`. Skillet commands locate the skill root by finding the nearest ancestor directory containing either `spec.md` or `SKILL.md`.

#### Scenario: Complete skill layout
- **WHEN** `skillet status` runs on a directory with spec.md, SKILL.md, and evals/cases/
- **THEN** all artifacts are discovered and reported without configuration

#### Scenario: Legacy skill detected
- **WHEN** a directory contains SKILL.md and a legacy `spec.yaml` but no `spec.md`
- **THEN** status reports the skill as legacy and points to the `/skillet:migrate` workflow

## REMOVED Requirements

### Requirement: System Prompt Assembly
**Reason**: There is no built-in agent to assemble a system prompt for; the harness agent loads SKILL.md through its own native skill mechanism.
**Migration**: None; the harness installs the skill directory into the spawned agent's skill location.

### Requirement: Reference File Loading
**Reason**: Reference loading existed to inline references into the built-in agent's prompt. The harness agent reads references itself, as real agents do.
**Migration**: Validation still checks that references linked from SKILL.md exist on disk (covered by validation capability).
