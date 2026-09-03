## ADDED Requirements

### Requirement: Explicit eval opt-in

The skillet-authoring skill SHALL complete ordinary skill creation, improvement, and migration by writing and validating `spec.md` and SKILL.md. It SHALL write eval cases or run `skillet eval` only when the user explicitly requests eval creation, execution, improvement, or diagnosis. Requesting an ordinary skill or encountering an existing empty eval directory SHALL NOT imply eval opt-in.

#### Scenario: Ordinary skill creation

- **WHEN** a user asks an agent to create a skill without mentioning evals or evaluation
- **THEN** the authoring skill produces and validates `spec.md` and SKILL.md without creating eval cases or running an eval harness

#### Scenario: User requests evaluation

- **WHEN** a user asks the authoring agent to add evals or evaluate a skill
- **THEN** the agent fetches `skillet instructions evals`, writes or updates the requested cases, validates them, and runs only the requested evaluation workflow

#### Scenario: Existing empty eval directory

- **WHEN** an ordinary authoring request targets a skill that already contains an empty `evals/` directory
- **THEN** the agent does not treat the directory as authorization to generate or run evals

### Requirement: Installed authoring skill refresh

The skillet-authoring skill SHALL follow a stale-install advisory from the latest `skillet status` before authoring artifacts. It SHALL use the reported refresh method, read the refreshed SKILL.md, and rerun status before continuing.

#### Scenario: Latest CLI reports stale instructions

- **WHEN** `skillet status --json` reports that the installed skillet-authoring instructions are stale
- **THEN** the agent refreshes them as directed, reads the refreshed SKILL.md, and reruns status before writing or changing skill artifacts

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
