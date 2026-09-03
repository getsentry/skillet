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
