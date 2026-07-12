# agent-integration Specification

## Purpose

Skillet makes zero LLM calls. Host agents do all generation, driven by
the skillet-authoring skill (shipped in-repo at skills/skillet-authoring,
delivered via @sentry/dotagents) that loops over `skillet status` and
`skillet instructions --json`; the CLI serves templates, writing rules,
and filesystem-derived state, so upgrading skillet upgrades every
agent's behavior.
## Requirements
### Requirement: Zero LLM calls in skillet

The skillet CLI SHALL make no LLM provider calls of its own. All generation — authoring `spec.md`, rendering SKILL.md and references, writing eval cases, and improving skills from failing evals — is performed by the host coding agent, guided by files skillet generates and instructions skillet serves.

#### Scenario: No credentials required
- **WHEN** any skillet command runs on a machine with no LLM credentials configured
- **THEN** the command completes without attempting any provider authentication (eval requires only the harness CLI binary)

### Requirement: Authoring skill delivery

Skillet SHALL ship its authoring workflow as a skill (`skills/skillet-authoring/`, itself a spec-driven skillet skill with evals) rather than per-tool generated files. `skillet init` SHALL offer to install that skill for all of the user's agents via `@sentry/dotagents` in user scope (`~/.agents`), asking for confirmation before writing anything; `--no-prompt` skips the confirmation for non-interactive callers. Users who prefer to manage delivery themselves SHALL be pointed at the dotagents add command and the skill's in-repo path instead.

#### Scenario: First-time setup
- **WHEN** `skillet init --no-prompt` runs on a machine where `~/.agents/agents.toml` does not reference the skill
- **THEN** the skill is added and installed via `npx @sentry/dotagents --user`, making it available to every dotagents-supported agent

#### Scenario: Already installed
- **WHEN** `skillet init` runs and the skill is already declared in user scope
- **THEN** init reports there is nothing to do and exits 0 without touching anything

#### Scenario: No consent, no writes
- **WHEN** `skillet init` runs non-interactively without `--no-prompt`
- **THEN** nothing is written; init explains what it would do and how to proceed or self-manage

### Requirement: Instructions served by the CLI

The authoring skill SHALL contain no artifact-format guidance itself; it scripts the agent to call `skillet status --json` and `skillet instructions <artifact> --json`, which return the template, writing instructions, output path, and dependency state for each artifact (`spec`, `skill`, `evals`). Upgrading the CLI upgrades every agent's behavior without touching the installed skill.

#### Scenario: Instructions payload
- **WHEN** an agent runs `skillet instructions spec --json`
- **THEN** stdout contains a single JSON object with the spec.md template, the grammar rules, the output path, and current artifact state

#### Scenario: Thin skill body
- **WHEN** skills/skillet-authoring/SKILL.md is inspected
- **THEN** it instructs the agent to fetch formats from `skillet instructions` rather than embedding SKILL.md-writing guidance inline

### Requirement: Filesystem as state machine

Workflow state SHALL be derived entirely from files on disk — which artifacts exist and whether they are stale relative to `spec.md`. There SHALL be no session files, pause/resume persistence, or lock files.

#### Scenario: Status from disk
- **WHEN** `skillet status --json` runs in a skill with spec.md and SKILL.md but no eval cases
- **THEN** the output reports spec and skill as done and evals as the next artifact, based purely on file presence

#### Scenario: Human edits are picked up
- **WHEN** a user hand-edits spec.md between agent sessions
- **THEN** the next `skillet status` reflects the edit (e.g. new behavior uncovered by evals) with no cache or session to invalidate

