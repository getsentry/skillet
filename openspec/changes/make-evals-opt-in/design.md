## Context

Skillet's filesystem state machine currently has one mandatory chain: `spec.md` → `SKILL.md` → eval cases → validation/evaluation. The CLI, authoring skill, bundled authoring spec, and documentation all reinforce that sequence. Although missing behavior coverage is only a validation warning, `status.next` and the authoring skill treat it as unfinished work, and `new` creates eval directories before the user has chosen to evaluate anything.

The eval engine and YAML case format are still useful for skills whose behavior benefits from repeatable harness runs. This change separates that optional measurement workflow from the core spec-driven authoring workflow.

## Goals / Non-Goals

**Goals:**

- Make `spec.md` plus a current, valid `SKILL.md` the complete default artifact path.
- Require an explicit user choice before an authoring agent writes or runs evals.
- Preserve existing eval files, commands, schemas, harnesses, and result formats.
- Validate every optional eval artifact that is present against its spec.
- Remove pressure to create one case for every behavior.

**Non-Goals:**

- Removing or redesigning the eval engine.
- Adding an eval-enabled flag to `skillet new`; users opt in by requesting eval instructions or creating a case.
- Automatically deleting empty eval directories or existing cases from skills.
- Changing the spec grammar or removing scenarios from behaviors.

## Decisions

### D1. Completion stops after the rendered skill

Once `spec.md` is valid and `SKILL.md` carries its current hash, `status.next` identifies validation as the completion gate and describes evals as optional. Existing cases remain visible in status, but their absence never becomes the next required artifact.

An explicit `complete` status field was considered and rejected. It would expand the public JSON contract when the existing `next` field can express the workflow without introducing persisted state.

### D2. New scaffolds contain only `spec.md`

`skillet new` creates the root and `spec.md`, but no eval directories. The eval loader already treats absent directories as an empty case set, and authors can create `evals/cases/` and `evals/fixtures/` if they opt in.

Keeping empty directories was rejected because Git does not preserve them and their presence implies that eval authoring is part of every skill.

### D3. Coverage checks validate references, not completeness

When eval cases exist, validation continues checking their schema, behavior or constraint identifiers, and fixtures. It stops emitting warnings for behaviors with no cases. Coverage views may still show which behaviors have cases; this is descriptive, not a completion score.

Making missing coverage warnings conditional on the presence of at least one case was rejected because it would still pressure an author who chooses one high-value case into evaluating every behavior.

### D4. The authoring agent requires explicit eval intent

The bundled authoring skill always writes and validates the spec and runtime skill. It writes or runs evals only when the user's request explicitly includes eval creation, evaluation, failing-eval diagnosis, or equivalent intent. Eval instructions remain available through `skillet instructions evals` for that branch.

Inferring eval intent from an existing `evals/` directory was rejected: legacy directories may be empty or stale, and filesystem presence is not user authorization to spend model usage.

## Risks / Trade-offs

- [Skills may ship without behavioral measurements] → Keep eval authoring and execution easy to invoke, and document where repeatable evaluation is valuable.
- [Existing automation may expect scaffolded eval directories] → Treat the scaffold JSON/output change as breaking and document that consumers create directories only when adding cases.
- [The word “coverage” may still imply a required target] → Describe coverage as a map of optional cases and remove all missing-case diagnostics from validation.
- [The bundled authoring skill has its own existing eval suite] → Preserve those tests as repository dogfood, but change the skill contract and cases so ordinary authoring does not generate evals by default.

## Migration Plan

1. Update the state machine, scaffold, coverage validator, tests, and CLI copy.
2. Change the authoring spec first, re-render its `SKILL.md` with the new hash, and adapt its dogfood eval cases.
3. Update README, lifecycle policy/reference, and documentation site to separate core authoring from optional evaluation.
4. Build the current CLI, run status/instructions/validate/eval-dry dogfood checks, then run repository and docs gates.

Existing skills require no file migration. Empty eval directories may remain, and existing eval cases keep their current behavior.

## Open Questions

None.
