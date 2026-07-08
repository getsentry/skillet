# agent-integration Specification

## Purpose

Skillet makes zero LLM calls. Host agents do all generation, driven by
thin generated /skillet:* workflows that loop over `skillet status`
and `skillet instructions --json`; the CLI serves templates, writing
rules, and filesystem-derived state, so upgrading skillet upgrades
every agent's behavior.
## Requirements
### Requirement: Zero LLM calls in skillet

The skillet CLI SHALL make no LLM provider calls of its own. All generation — authoring `spec.md`, rendering SKILL.md and references, writing eval cases, and improving skills from failing evals — is performed by the host coding agent, guided by files skillet generates and instructions skillet serves.

#### Scenario: No credentials required
- **WHEN** any skillet command runs on a machine with no LLM credentials configured
- **THEN** the command completes without attempting any provider authentication (eval requires only the harness CLI binary)

### Requirement: Tool integration scaffolding

`skillet init [--tools <ids>]` SHALL generate per-tool workflow files (skills and/or slash commands) for supported agents — at minimum Claude Code and Codex CLI — covering the core workflows: propose (author spec.md from a description), render (produce SKILL.md, references, and eval cases from spec.md), improve (iterate on failing evals), and migrate (import a legacy spec.yaml or bare SKILL.md).

#### Scenario: Claude Code integration
- **WHEN** `skillet init --tools claude` runs
- **THEN** slash-command files are written under `.claude/` so `/skillet:propose`, `/skillet:render`, `/skillet:improve`, and `/skillet:migrate` are available

#### Scenario: Regeneration after upgrade
- **WHEN** `skillet init --force` (or an update command) runs after a CLI upgrade
- **THEN** generated workflow files are refreshed to the current CLI version's content

### Requirement: Instructions served by the CLI

Generated workflow files SHALL contain no authoring guidance themselves; they script the agent to call `skillet status --json` and `skillet instructions <artifact> --json`, which return the template, writing instructions, output path, and dependency state for each artifact (`spec`, `skill`, `evals`). Upgrading the CLI upgrades every agent's behavior without touching generated files.

#### Scenario: Instructions payload
- **WHEN** an agent runs `skillet instructions spec --json`
- **THEN** stdout contains a single JSON object with the spec.md template, the grammar rules, the output path, and current artifact state

#### Scenario: Thin prompt files
- **WHEN** a generated `/skillet:render` command file is inspected
- **THEN** it instructs the agent to fetch instructions from the CLI rather than embedding SKILL.md-writing guidance inline

### Requirement: Filesystem as state machine

Workflow state SHALL be derived entirely from files on disk — which artifacts exist and whether they are stale relative to `spec.md`. There SHALL be no session files, pause/resume persistence, or lock files.

#### Scenario: Status from disk
- **WHEN** `skillet status --json` runs in a skill with spec.md and SKILL.md but no eval cases
- **THEN** the output reports spec and skill as done and evals as the next artifact, based purely on file presence

#### Scenario: Human edits are picked up
- **WHEN** a user hand-edits spec.md between agent sessions
- **THEN** the next `skillet status` reflects the edit (e.g. new behavior uncovered by evals) with no cache or session to invalidate

