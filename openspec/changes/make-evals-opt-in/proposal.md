## Why

Skillet currently treats eval coverage as part of every skill's required authoring path. For most skills, that pushes authors to build and maintain cases whose cost exceeds their value, making a useful spec-driven skill feel incomplete until it is overbuilt.

## What Changes

- **BREAKING**: Define a complete Skillet skill as a valid `spec.md` plus a current `SKILL.md`; eval cases are optional extensions.
- Scaffold only `spec.md` for a new skill instead of creating empty eval directories.
- Make `skillet status` finish the default authoring flow after `SKILL.md` is current, while reporting existing eval cases without prescribing them.
- Keep eval authoring, schema validation, coverage reporting, and execution available when a user explicitly chooses to add or run evals.
- Stop warning that uncovered spec behaviors need eval cases; continue rejecting eval cases that reference unknown behaviors or missing fixtures.
- Update the authoring skill and documentation to present evals as a deliberate opt-in workflow.
- Make the latest `skillet status` detect a stale standard installation of the authoring skill and direct the agent to reinstall it through its owning mechanism before continuing; rereading supports same-session continuation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cli`: New-skill scaffolding and status make the spec-to-skill path complete without eval artifacts.
- `skill-spec`: `spec.md` drives `SKILL.md`; eval cases may derive from selected scenarios but are not required for every behavior.
- `validation`: Optional eval artifacts are validated when present without emitting missing-coverage warnings.
- `agent-integration`: The authoring skill stops generating evals or running evaluations unless the user explicitly requests them.

## Impact

This changes the filesystem state machine, scaffold output, coverage diagnostics, authoring instructions, bundled authoring skill, CLI copy, lifecycle reference, README, and documentation site. Existing eval suites and the `eval` command remain compatible; consumers that expect `skillet new --json` to list eval directories or `status.next` to require evals must adapt. A stale user-scoped authoring skill can temporarily take priority in `status.next` until it is reinstalled and status is rerun.
