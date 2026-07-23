# Agent Integration Delta

## ADDED Requirements

### Requirement: Current CLI execution

The skillet-authoring skill SHALL invoke every Skillet command through an explicit current package runner: `npx -y @sentry/skillet@latest` for npm or `pnpx @sentry/skillet@latest` for pnpm. It SHALL NOT prefer a bare globally installed `skillet` executable merely because one is available on PATH.

#### Scenario: Global CLI is already installed

- **GIVEN** `skillet` exists on PATH but may be older than the installed authoring skill
- **WHEN** the agent checks status, fetches instructions, validates, or evaluates a skill
- **THEN** it uses `npx -y @sentry/skillet@latest` or the pnpm equivalent

#### Scenario: Update notice from a bare invocation

- **WHEN** an installed Skillet command recommends a newer version
- **THEN** the agent reruns the relevant command through the explicit latest package runner before continuing artifact work
