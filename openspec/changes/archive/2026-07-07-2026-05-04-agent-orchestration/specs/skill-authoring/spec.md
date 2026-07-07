## MODIFIED Requirements

### Requirement: Agentic skill authoring loop

The system SHALL provide an `authorSkill()` entry that
orchestrates skill creation and improvement through a fixed
agent sequence rather than a multi-phase code pipeline. The
sequence SHALL be: establish spec (spec-author dialogue, only
when spec.yaml is missing) → writer fan-out (skill-writer +
eval-writer in parallel) → validator fan-out (skill-validator
+ evals-validator in parallel) → per-pair re-pass on errors →
return.

#### Scenario: Create skill from scratch
- **WHEN** `authorSkill` is called with mode `create` and a
  natural-language description
- **THEN** spec-author runs interactively to produce
  `spec.yaml`, after which the orchestrator runs the writer
  fan-out, the validator fan-out, and any required re-passes
- **AND** the orchestrator does not run vitest

#### Scenario: Improve existing skill
- **WHEN** `authorSkill` is called with mode `improve` and a
  path to a skill with an existing `spec.yaml`
- **THEN** spec-author is skipped; the orchestrator runs the
  writer fan-out, validator fan-out, and re-pass routing
  against the existing spec
- **AND** if `failingEvals` is populated from a prior vitest
  run, `skill-writer` receives the failing-eval context and
  `eval-writer` does not

#### Scenario: Add eval to existing skill
- **WHEN** `authorSkill` is called via `skillet add-eval` with
  a new behavior or must_not added to `spec.yaml`
- **THEN** the orchestrator runs `eval-writer` and
  `evals-validator` only, leaving `SKILL.md` and existing eval
  files untouched

### Requirement: Bundled skill-writer knowledge

Skillet SHALL ship the authoring knowledge that drives skill
generation as one or more bundled Anthropic Agent Skills under
the package's `agents/` directory, loadable without network
access. Knowledge SHALL live in agent-readable Markdown
references rather than as TypeScript prompt files.

#### Scenario: Reference material available at runtime
- **WHEN** the orchestrator starts the writer fan-out
- **THEN** the bundled `agents/skill-writer/` directory and its
  `references/` subtree are reachable from the package root
- **AND** the bundled `agents/eval-writer/`,
  `agents/skill-validator/`, and `agents/evals-validator/`
  directories are likewise reachable

#### Scenario: No external dependencies for knowledge
- **WHEN** skillet runs in an offline environment
- **THEN** all four bundled agents resolve from disk without
  network access

## REMOVED Requirements

### Requirement: Phase-based LLM calls

**Reason**: The phase decomposition (skill-gen, eval-gen,
skill-improve, reference-gen, with eval-gen further split into
five sub-stages) collapses into the agent roster defined under
the `agent-orchestration` capability. Knowledge that previously
lived in per-phase TypeScript prompt files moves into bundled
agent SKILL.md + references files.

**Migration**: Phase files under `src/authoring/phases/` and
their corresponding prompt files under
`src/authoring/prompts/` are deleted on cutover. Spec-author
files (`spec-author.ts`, `seed-from-description.ts`,
`seed-from-skill.ts`) are preserved — spec-author remains a
distinct interactive agent producing `spec.yaml`. The content
of `_code-eval-contract.ts` migrates verbatim into
`agents/eval-writer/references/eval-contract.md`.

### Requirement: Iteration control

**Reason**: The fixed iteration cap with per-iteration eval
runs is replaced by the per-writer re-pass cap defined under
the `agent-orchestration` capability (default: 1 re-pass per
writer per orchestration cycle). The eval-pass-driven improve
loop is reachable through the `skillet improve` CLI path,
which re-enters the orchestrator with `failingEvals` populated.

**Migration**: `--max-iterations` CLI flag is removed. Users
who want to drive multiple eval-then-improve cycles run
`skillet eval` and `skillet improve` in sequence as needed.
