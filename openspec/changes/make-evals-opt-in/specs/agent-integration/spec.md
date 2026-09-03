## ADDED Requirements

### Requirement: Explicit eval opt-in

The skillet-authoring skill SHALL complete ordinary skill creation, improvement, and migration by writing and validating `spec.md` and SKILL.md. It SHALL write or repair eval cases or run `skillet eval` only when the user explicitly requests eval creation, execution, improvement, or diagnosis. Requesting an ordinary skill or encountering existing eval artifacts SHALL NOT imply eval opt-in. When existing optional eval errors prevent full validation, the agent SHALL report them and request eval-maintenance opt-in rather than changing those artifacts or claiming completion.

#### Scenario: Ordinary skill creation

- **WHEN** a user asks an agent to create a skill without mentioning evals or evaluation
- **THEN** the authoring skill produces and validates `spec.md` and SKILL.md without creating eval cases or running an eval harness

#### Scenario: User requests evaluation

- **WHEN** a user asks the authoring agent to add evals or evaluate a skill
- **THEN** the agent fetches `skillet instructions evals`, writes or updates the requested cases, validates them, and runs only the requested evaluation workflow

#### Scenario: Existing empty eval directory

- **WHEN** an ordinary authoring request targets a skill that already contains an empty `evals/` directory
- **THEN** the agent does not treat the directory as authorization to generate or run evals

#### Scenario: Existing invalid optional eval

- **WHEN** ordinary authoring leaves the core spec.md and SKILL.md current but an existing optional eval case fails validation
- **THEN** the agent reports the eval error and requests permission before repairing it, without claiming the skill is fully validated while the error remains

### Requirement: Installed authoring skill reinstallation

The skillet-authoring skill SHALL follow a stale-install advisory from the latest `skillet status` before authoring artifacts. It SHALL reinstall the skill through the reported installation method and rerun status before continuing. It SHALL read the reinstalled SKILL.md only to continue in the same session; otherwise it SHALL begin a new session.

#### Scenario: Latest CLI reports stale instructions

- **WHEN** `skillet status --json` reports that the installed skillet-authoring instructions are stale
- **THEN** the agent reinstalls the skill as directed and either reads the reinstalled SKILL.md in the same session or begins a new session before rerunning status and changing skill artifacts

## MODIFIED Requirements

### Requirement: Filesystem as state machine

Workflow state SHALL be derived entirely from files on disk — whether the required `spec.md` and SKILL.md artifacts exist and whether SKILL.md is stale relative to `spec.md`. Optional eval cases SHALL be reported when present but SHALL NOT be a required state in the default authoring workflow. There SHALL be no session files, pause/resume persistence, or lock files.

#### Scenario: Status from disk without evals

- **WHEN** `skillet status --json` runs in a skill with spec.md and a current SKILL.md but no eval cases
- **THEN** the output reports the core artifacts as complete and directs validation as the completion gate while describing evals as optional

#### Scenario: Status from disk with evals

- **WHEN** `skillet status --json` runs in a skill with optional eval cases
- **THEN** the output reports their case count without making complete behavior coverage part of the default authoring state

#### Scenario: Human edits are picked up

- **WHEN** a user hand-edits spec.md between agent sessions
- **THEN** the next `skillet status` marks SKILL.md stale with no cache or session to invalidate
