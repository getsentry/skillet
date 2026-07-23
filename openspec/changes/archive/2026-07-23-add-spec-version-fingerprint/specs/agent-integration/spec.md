# Agent Integration Delta

## MODIFIED Requirements

### Requirement: Instructions served by the CLI

The authoring skill SHALL contain no artifact-format guidance itself; it scripts the agent to call `skillet status --json` and `skillet instructions <artifact> --json`, which return the template, writing instructions, output path, and dependency state for each artifact (`spec`, `skill`, `evals`). Upgrading the CLI upgrades every agent's behavior without touching the installed skill. Spec guidance SHALL include the exact `<!-- skillet-version: <version> -->` footer for the running CLI and direct the agent to preserve it as the final non-empty line.

#### Scenario: Agent requests spec guidance

- **WHEN** an agent runs `skillet instructions spec --json`
- **THEN** the returned template ends with the running CLI's version footer
- **AND** the writing instructions require that footer on the authored spec

#### Scenario: Agent requests another artifact

- **WHEN** an agent runs `skillet instructions skill --json` or `skillet instructions evals --json`
- **THEN** the response contains that artifact's current template and rules without duplicating spec-format guidance

#### Scenario: Installed authoring skill is inspected

- **WHEN** the installed skillet-authoring SKILL.md is inspected after a CLI upgrade
- **THEN** it delegates artifact formatting to `skillet instructions` rather than embedding a version-specific spec footer value
