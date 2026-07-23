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

### Requirement: Filesystem as state machine

Workflow state SHALL be derived entirely from files on disk — which artifacts exist and whether they are stale relative to `spec.md`. There SHALL be no session files, pause/resume persistence, or lock files.

#### Scenario: Status from disk
- **WHEN** `skillet status --json` runs in a skill with spec.md and SKILL.md but no eval cases
- **THEN** the output reports spec and skill as done and evals as the next artifact, based purely on file presence

#### Scenario: Human edits are picked up
- **WHEN** a user hand-edits spec.md between agent sessions
- **THEN** the next `skillet status` reflects the edit (e.g. new behavior uncovered by evals) with no cache or session to invalidate

### Requirement: Honest eval check guidance

The instructions returned by `skillet instructions evals` SHALL distinguish direct deterministic proof from textual or structural proxies. They SHALL prefer executable verification and exact workspace state, warn that deterministic failures skip judge checks, reject string presence as evidence of semantic correctness unless the text itself is required, and permit judge-only cases when no direct deterministic proof exists.

#### Scenario: Semantic architecture requirement

- **WHEN** an agent writes an eval for an architectural requirement that admits multiple valid implementations
- **THEN** the instructions direct it to use a semantic judge rather than grep for likely API names or constructors

#### Scenario: Directly executable requirement

- **WHEN** an agent writes an eval for behavior that can be proven by tests, produced code, typechecking, a build, or exact filesystem or git state
- **THEN** the instructions direct it to use that deterministic evidence before adding a judge

#### Scenario: No deterministic proof available

- **WHEN** a requirement is semantic and has no direct deterministic proof
- **THEN** the instructions allow a judge-only case instead of requiring weak shell checks

### Requirement: Behavior-preserving migration guidance

The instructions returned by `skillet instructions spec` SHALL direct agents migrating an existing skill to inventory behavior-bearing material from the legacy runtime skill, legacy specs, references, and nearby maintenance docs before drafting `spec.md`. The inventory SHALL include triggers, ordered workflow, exact enumerations, protocols and output formats, numeric thresholds, failure and stopping rules, constraints, and runtime references. Every accepted behavioral rule SHALL be represented in the new behavior contract; verbose execution detail MAY additionally be retained or relocated in a linked runtime reference after the spec defines the observable contract, while non-behavior content SHALL be explicitly superseded or rejected.

The instructions returned by `skillet instructions skill` SHALL distinguish concise rewriting from behavior loss. Exact runtime formats, thresholds, enumerations, and delegation or output protocols SHALL be represented in `spec.md`; their verbose execution detail MAY be preserved in `SKILL.md` or a linked runtime reference, and the agent SHALL reconcile removed legacy rules before completing the render.

#### Scenario: Migrate a skill with exact reviewer protocols

- **GIVEN** an existing skill has a legacy `SKILL.md` with an enumerated review taxonomy, a three-agent concurrency limit, structured finding output, numeric loop stops, and long reviewer prompt templates
- **WHEN** an agent follows the CLI-served spec and skill instructions to migrate it
- **THEN** those operational contracts appear in `spec.md` and the rendered runtime surfaces, with long templates optionally moved to a linked reference rather than silently dropped

#### Scenario: Remove obsolete maintenance prose

- **GIVEN** a legacy maintenance document contains historical or stale prose that is not part of the accepted runtime contract
- **WHEN** the agent performs the migration reconciliation
- **THEN** it may omit or update that prose while preserving the runtime behavior and explicitly accounting for the intentional change

### Requirement: Current CLI execution

The skillet-authoring skill SHALL invoke every Skillet command through an explicit current package runner: `npx -y @sentry/skillet@latest` for npm or `pnpx @sentry/skillet@latest` for pnpm. It SHALL NOT prefer a bare globally installed `skillet` executable merely because one is available on PATH.

#### Scenario: Global CLI is already installed

- **GIVEN** `skillet` exists on PATH but may be older than the installed authoring skill
- **WHEN** the agent checks status, fetches instructions, validates, or evaluates a skill
- **THEN** it uses `npx -y @sentry/skillet@latest` or the pnpm equivalent

#### Scenario: Update notice from a bare invocation

- **WHEN** an installed Skillet command recommends a newer version
- **THEN** the agent reruns the relevant command through the explicit latest package runner before continuing artifact work

