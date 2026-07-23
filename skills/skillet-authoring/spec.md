# Skillet Authoring

## Intent

Drive agent-skill creation, improvement, and migration through the Skillet CLI instead of freehand SKILL.md writing. The spec defines the behavior, SKILL.md contains the agent instructions, and eval cases exercise the spec scenarios through a real agent CLI. This skill exists so that "make me a skill" starts with reviewable files and repeatable checks.

## Triggers

- **SHOULD** trigger when the user asks to create, write, or author an agent skill
- **SHOULD** trigger when the user asks to improve a skill, fix its evals, or diagnose failing skill evals
- **SHOULD** trigger when the user asks to migrate a legacy skill (a bare SKILL.md, uppercase SPEC.md, or spec.yaml)
- **SHOULD NOT** trigger when the user asks to use or run an existing skill
- **SHOULD NOT** trigger on questions about a repository that merely contains skills

## Behaviors

### Behavior: Status drives the flow

The agent SHALL consult `skillet status <dir> --json` before producing artifacts and do what its `next` field says, rather than guessing the skill's state.

#### Scenario: Picking up a half-built skill

- **WHEN** asked to continue a skill directory that has spec.md but no SKILL.md
- **THEN** the agent renders SKILL.md next, as status directs, instead of rewriting the spec or starting over

#### Scenario: Adopt a skill with uppercase SPEC.md

- **WHEN** asked to adopt an existing skill that has SKILL.md and uppercase SPEC.md but no lowercase spec.md
- **THEN** the agent preserves or renames the legacy document, derives lowercase spec.md first as status directs, then renders current instructions and adds behavior coverage

#### Scenario: Adopt a skill with an incompatible lowercase spec.md

- **WHEN** asked to adopt an existing skill whose lowercase spec.md uses a different structure and fails Skillet validation
- **THEN** the agent preserves or renames the legacy content, derives a valid Skillet spec.md before rendering SKILL.md, then adds behavior coverage

### Behavior: Spec precedes derived artifacts

The agent SHALL write and validate spec.md before rendering SKILL.md or eval cases.

#### Scenario: New skill from a description

- **WHEN** asked to create a new skill from a prose description
- **THEN** a spec.md exists, passes `skillet validate`, and SKILL.md is rendered only after the spec was written

### Behavior: Preserve legacy runtime contracts

When migrating an existing skill, the agent SHALL inventory behavior-bearing material from the legacy SKILL.md, specs, references, and maintenance docs before drafting, represent every accepted behavioral rule in spec.md, preserve verbose execution detail in SKILL.md or linked runtime references after the spec defines the observable contract, and reconcile every removed rule before calling the migration complete.

#### Scenario: Adopt a skill with an exact deletion threshold

- **GIVEN** a legacy skill lists files before deletion, asks for confirmation only before deleting more than ten files, and forbids deleting unrelated files
- **WHEN** the agent adopts the skill into Skillet
- **THEN** the lowercase spec and rendered runtime preserve the listing rule, the exact more-than-ten threshold, and the unrelated-file constraint while any moved detail remains linked from SKILL.md

### Behavior: Instructions set the format

The agent SHALL fetch `skillet instructions <artifact> <dir> --json` for each artifact it writes and follow the served template and rules, never an invented or remembered format.

#### Scenario: Writing eval cases

- **WHEN** writing eval cases for an existing skill
- **THEN** the case files follow the schema served by `skillet instructions evals` and pass `skillet validate`

### Behavior: Every behavior gets an eval

The agent SHALL cover every spec behavior with at least one eval case before calling the skill complete.

#### Scenario: Full render

- **WHEN** rendering a skill's artifacts to completion
- **THEN** `skillet validate` reports no "has no eval case" coverage warnings

### Behavior: Failures fixed at the right layer

When an eval fails, the agent SHALL classify the failure — wrong spec intent, weak SKILL.md wording, or an unfair eval case — before editing anything, and fix at that layer only.

#### Scenario: Wording failure

- **WHEN** an eval fails because SKILL.md expresses a behavior ambiguously
- **THEN** the SKILL.md wording is tightened and the eval case file is left untouched

## Constraints

### Constraint: Validation gates completion

The agent MUST NOT report a skill as done while `skillet validate` reports errors.

### Constraint: No eval weakening

The agent MUST NOT delete or loosen eval cases to make results pass; editing a case is justified only when the case itself is demonstrably unfair, and the agent says why.

### Constraint: No unrequested scaffolding

The agent MUST NOT scaffold or modify skill artifacts when the user asked a question or an unrelated task.
