# Skillet Authoring

## Intent

Drive agent-skill creation, improvement, and migration through the Skillet CLI instead of freehand SKILL.md writing. The spec defines the behavior and SKILL.md contains the agent instructions; eval cases are an optional extension for skills that benefit from repeatable harness runs. This skill exists so that "make me a skill" starts with a reviewable contract without forcing evaluation work the user did not request.

## Triggers

- **SHOULD** trigger when the user asks to create, write, or author an agent skill
- **SHOULD** trigger when the user asks to improve a skill, fix its evals, or diagnose failing skill evals
- **SHOULD** trigger when the user asks to migrate a legacy skill (a bare SKILL.md, uppercase SPEC.md, or spec.yaml)
- **SHOULD NOT** trigger when the user asks to use or run an existing skill
- **SHOULD NOT** trigger on questions about a repository that merely contains skills

## Behaviors

### Behavior: Current CLI execution

The agent SHALL invoke Skillet through `npx -y @sentry/skillet@latest` or `pnpx @sentry/skillet@latest` for every authoring command instead of preferring a bare executable from PATH.

#### Scenario: Global CLI already exists

- **GIVEN** `skillet` is available on PATH but may be older than the installed authoring skill
- **WHEN** the agent checks status, fetches instructions, validates, or evaluates a skill
- **THEN** it uses an explicit latest package runner for the command

#### Scenario: Installed CLI recommends an update

- **WHEN** a bare Skillet invocation reports that a newer version is available
- **THEN** the agent reruns the relevant command through the explicit latest package runner before continuing

### Behavior: Status drives the flow

The agent SHALL consult `npx -y @sentry/skillet@latest status <dir> --json` before producing artifacts and do what its `next` field says, rather than guessing the skill's state.

If status reports that the installed skillet-authoring instructions are stale, the agent SHALL refresh them using the reported method, read the refreshed SKILL.md, and rerun status before continuing artifact work.

#### Scenario: Picking up a half-built skill

- **WHEN** asked to continue a skill directory that has spec.md but no SKILL.md
- **THEN** the agent renders SKILL.md next, as status directs, instead of rewriting the spec or starting over

#### Scenario: Adopt a skill with uppercase SPEC.md

- **WHEN** asked to adopt an existing skill that has SKILL.md and uppercase SPEC.md but no lowercase spec.md
- **THEN** the agent preserves or renames the legacy document, derives lowercase spec.md first as status directs, then renders and validates current instructions

#### Scenario: Adopt a skill with an incompatible lowercase spec.md

- **WHEN** asked to adopt an existing skill whose lowercase spec.md uses a different structure and fails Skillet validation
- **THEN** the agent preserves or renames the legacy content, derives a valid Skillet spec.md before rendering and validating SKILL.md

#### Scenario: Status reports stale authoring instructions

- **WHEN** the latest CLI reports that the installed skillet-authoring instructions are stale
- **THEN** the agent follows the reported refresh direction, reads the refreshed SKILL.md, and reruns status before writing or changing skill artifacts

### Behavior: Spec precedes derived artifacts

The agent SHALL write and validate spec.md before rendering SKILL.md or any explicitly requested eval cases.

#### Scenario: New skill from a description

- **WHEN** asked to create a new skill from a prose description
- **THEN** a spec.md exists, passes validation through the explicit latest package runner, and SKILL.md is rendered only after the spec was written

### Behavior: Preserve legacy runtime contracts

When migrating an existing skill, the agent SHALL inventory behavior-bearing material from the legacy SKILL.md, specs, references, and maintenance docs before drafting, represent every accepted behavioral rule in spec.md, and reconcile every removed rule before calling the migration complete. It MAY preserve verbose execution detail in SKILL.md or linked runtime references after the spec defines the observable contract.

#### Scenario: Adopt a skill with an exact deletion threshold

- **GIVEN** a legacy skill lists files before deletion, asks for confirmation before deleting more than ten files, and forbids deleting unrelated files
- **WHEN** the agent adopts the skill into Skillet
- **THEN** the lowercase spec and rendered runtime preserve the listing rule, the exact more-than-ten threshold, and the unrelated-file constraint while any moved detail remains linked from SKILL.md

### Behavior: Instructions set the format

The agent SHALL fetch `npx -y @sentry/skillet@latest instructions <artifact> <dir> --json` for each artifact it writes and follow the served template and rules, never an invented or remembered format.

#### Scenario: Writing eval cases

- **WHEN** writing eval cases for an existing skill
- **THEN** the case files follow the schema served by the explicit latest package runner and pass validation through that same runner

#### Scenario: Writing a spec

- **WHEN** writing or revising spec.md
- **THEN** the final non-empty line is the Skillet version footer served by the current spec instructions

### Behavior: Eval work is explicit

The agent SHALL complete ordinary skill authoring by writing and validating spec.md and SKILL.md without creating or running evals. It SHALL write eval cases, execute them, or diagnose their failures only when the user explicitly requests that evaluation work; existing empty eval directories do not imply consent.

#### Scenario: Ordinary skill creation

- **WHEN** the user asks to create a skill without mentioning evals or evaluation
- **THEN** the agent writes and validates spec.md and SKILL.md without creating eval cases or running an eval harness

#### Scenario: Eval authoring requested

- **WHEN** the user explicitly asks to add eval cases to a skill
- **THEN** the agent fetches current eval instructions, writes cases for the selected high-value scenarios, and validates their schemas and spec links without requiring every behavior to have a case

#### Scenario: Eval execution requested

- **WHEN** the user explicitly asks to evaluate a skill that has cases
- **THEN** the agent runs the requested dry, normal, or baseline evaluation and reports its results

#### Scenario: Empty eval directory exists

- **GIVEN** an ordinary authoring request targets a skill with an empty evals directory
- **WHEN** the agent completes the spec and SKILL.md workflow
- **THEN** it does not create cases or start an eval harness solely because the directory exists

### Behavior: Failures fixed at the right layer

When an eval fails, the agent SHALL classify the failure — wrong spec intent, weak SKILL.md wording, or an unfair eval case — before editing anything, and fix at that layer only.

#### Scenario: Wording failure

- **WHEN** an eval fails because SKILL.md expresses a behavior ambiguously
- **THEN** the SKILL.md wording is tightened and the eval case file is left untouched

## Constraints

### Constraint: Validation gates completion

The agent MUST NOT report a skill as done while validation through the explicit latest package runner reports errors.

### Constraint: No eval weakening

The agent MUST NOT delete or loosen eval cases to make results pass; editing a case is justified only when the case itself is demonstrably unfair, and the agent says why.

### Constraint: No unrequested scaffolding

The agent MUST NOT scaffold or modify skill artifacts when the user asked a question or an unrelated task.

<!-- skillet-version: 1.7.0 -->
