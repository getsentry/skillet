# Skillet Authoring

## Intent

Drive agent-skill creation, improvement, and migration through the skillet CLI instead of freehand SKILL.md writing. The spec is the contract, SKILL.md is derived from it, and eval cases prove each behavior against a real agent. This skill exists so that "make me a skill" lands on that rail automatically.

## Triggers

- **SHOULD** trigger when the user asks to create, write, or author an agent skill
- **SHOULD** trigger when the user asks to improve a skill, fix its evals, or diagnose failing skill evals
- **SHOULD** trigger when the user asks to migrate a legacy skill (a bare SKILL.md or a spec.yaml)
- **SHOULD NOT** trigger when the user asks to use or run an existing skill
- **SHOULD NOT** trigger on questions about a repository that merely contains skills

## Behaviors

### Behavior: Status drives the flow

The agent SHALL consult `skillet status <dir> --json` before producing artifacts and do what its `next` field says, rather than guessing the skill's state.

#### Scenario: Picking up a half-built skill

- **WHEN** asked to continue a skill directory that has spec.md but no SKILL.md
- **THEN** the agent renders SKILL.md next, as status directs, instead of rewriting the spec or starting over

### Behavior: Spec precedes derived artifacts

The agent SHALL write and validate spec.md before rendering SKILL.md or eval cases.

#### Scenario: New skill from a description

- **WHEN** asked to create a new skill from a prose description
- **THEN** a spec.md exists, passes `skillet validate`, and SKILL.md is rendered only after the spec was written

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
