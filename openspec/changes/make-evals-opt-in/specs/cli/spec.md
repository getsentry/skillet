## MODIFIED Requirements

### Requirement: CLI command surface

The CLI SHALL support exactly seven commands, all mechanical (no LLM calls): `init` (set up the authoring skill via @sentry/dotagents), `new <name>` (scaffold a skill directory with a spec.md template), `status` (artifact state for a skill), `instructions <artifact>` (serve templates and writing instructions to agents), `validate` (structural validation), `eval` (run optional eval cases through the harness), and `show` (pretty-print a skill's spec and optional eval coverage). The commands `create`, `improve`, `spec`, `add-eval`, `resume`, `compare`, and `install` are removed.

#### Scenario: New skill scaffold

- **WHEN** `skillet new commit-helper` runs
- **THEN** a `commit-helper/` directory is created containing a templated `spec.md`
- **AND** no eval directories are created unless the user later opts into eval authoring

#### Scenario: Removed command

- **WHEN** `skillet create "some skill"` runs
- **THEN** the CLI exits non-zero with a message pointing to the agent-driven workflow and `skillet new`

## ADDED Requirements

### Requirement: Stale authoring skill advisory

Before reporting the target skill's artifact step, `skillet status` SHALL compare a standard user-scoped `~/.agents/skills/skillet-authoring/SKILL.md` installation with the authoring-spec hash bundled into the current CLI. When stale, `status.next` SHALL direct the agent to reinstall the skill through the installation's owning mechanism and rerun status before continuing. It SHALL distinguish rereading the reinstalled SKILL.md as necessary only to continue in the current session; otherwise it SHALL direct starting a new session. Status SHALL NOT modify the installation or user configuration.

#### Scenario: Current or absent standard installation

- **WHEN** the standard authoring skill installation is absent or records the current bundled spec hash
- **THEN** status reports the target skill's filesystem-derived next step without an authoring reinstall advisory

#### Scenario: Stale dotagents-managed installation

- **GIVEN** the standard authoring skill is stale and `~/.agents/agents.toml` declares `skillet-authoring` from `getsentry/skillet`
- **WHEN** status runs
- **THEN** `status.next` directs the agent to reinstall the skill by running `npx -y @sentry/dotagents@latest --user add getsentry/skillet skillet-authoring` and rerun status, reading the reinstalled SKILL.md only when continuing in the same session

#### Scenario: Stale installation with unknown ownership

- **GIVEN** the standard authoring skill is stale but its exact dotagents declaration is absent
- **WHEN** status runs
- **THEN** `status.next` directs the agent to reinstall the skill through the original installation method and rerun status, reading the reinstalled SKILL.md only when continuing in the same session
