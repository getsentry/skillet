# Tasks

## Spec format

- [x] 1. Add `class: SkillClass` (required) to `Spec` type and YAML parser.
- [x] 2. Add optional `dimensions: string[]` to `Behavior` type.
- [x] 3. Update structural validation to require `class` and accept `dimensions`.

## Class definitions

- [x] 4. Write `src/spec/classes.ts` declaring per-class required dimensions and
       required reference topics for `workflow-process`, `integration-documentation`,
       `security-review`, `skill-authoring`, `generic`. Names match
       getsentry/skills' skill-writer.
- [x] 5. Write `validateClassGates(spec)` in `src/spec/structural.ts`.

## Seed strategies

Seeders moved to `src/authoring/seed/` to avoid making the `src/spec/`
data layer depend on the LLM-driven authoring layer. Public contract is
unchanged.

- [x] 6. Create `src/authoring/seed/from-description.ts`.
- [x] 7. Create `src/authoring/seed/from-skill.ts`.
- [x] 8. Create `src/authoring/seed/from-improve.ts` (pure data transform —
       no LLM).
- [x] 9. Move existing import parsing logic and the frontmatter-extras
       capture from `phases/spec-import.ts` into `seed/from-skill.ts`.

## Spec-author loop

- [x] 10. Create `src/authoring/phases/spec-author.ts` with a multi-turn loop:
        propose → validate → question/commit, terminating on user acceptance
        of a gate-passing spec.
- [x] 11. Create `src/authoring/prompts/spec-author.ts` with class-aware
        prompt.
- [x] 12. Structured turn output `{ patches[], questions[], commit_request }`
        parsed and validated; invalid patches loop the LLM back with
        guidance instead of crashing.

## Interactive transport

- [x] 13. `src/cli/transport.ts` with `createInteractiveSession()`: blocking
        readline `askQuestions` (batched), final accept prompt `askAccept`,
        TTY detection.
- [x] 14. Non-TTY mode: `askQuestions` rejects with
        `PausedForAnswers(questions[])`. The spec-author loop wraps that as
        `SpecAuthorPaused(questions, spec, messages)` so callers can persist
        the full state.

## Resumable session

- [x] 14a. `src/authoring/session.ts` with `SpecAuthorSession` schema and
         read/write/delete helpers. Session file at
         `<skillRoot>/.skillet-session.json`.
- [x] 14b. `src/cli/pause.ts` with `handleSpecAuthorPause` — persists the
         session, prints questions + resume hint, returns exit code 2.
- [x] 14c. `src/commands/resume.ts` with `skillet resume <path> --answer
         "..."`. Validates answer count matches pending questions, hydrates
         the loop with `resume: { messages, pendingAnswers }`, regenerates on
         accept.
- [x] 14d. `runSpecAuthor` accepts `resume?: { messages, pendingAnswers }` to
         continue from a hydrated session.
- [x] 14e. `create`, `spec init`, `spec import` refuse to start when a
         session file exists at the target dir.

## Wiring

- [x] 15. `src/authoring/loop.ts` calls seed-then-author for both create and
        legacy-import paths.
- [x] 16. `src/commands/spec.ts` (`spec init` and `spec import`) dispatches the
        right seed and runs the author loop.
- [-] 17. `src/commands/improve.ts`: deferred. The improve loop tunes
        SKILL.md prose only and does not currently mutate the spec, so an
        author-loop entry here would be a behavior change beyond this
        refactor's scope. `seedFromImprove` is in place for future use.

## Deletions

- [x] 18. Deleted `src/authoring/phases/spec-init.ts` and
        `src/authoring/prompts/spec-init.ts`.
- [x] 19. Deleted `src/authoring/phases/spec-import.ts` and
        `src/authoring/prompts/spec-import.ts`.
- [x] 20. Removed `PhaseInterruptedForHumanInput` and its handler sites.
- [x] 21. Removed the empty `src/plan/` directory.

## References & docs

- [x] 22. `references/authoring-guidance.md`: appended a "Spec-Author Loop"
        section. The class matrix was already present and matches the new
        class names (workflow-process, integration-documentation,
        security-review, skill-authoring, generic) verbatim.
- [x] 23. `README.md`: updated commands table to describe the interactive
        spec-author loop.

## Validation

- [x] 24. `npm run typecheck` — passes.
- [x] 25. `npm run check` — passes (0 errors; pre-existing lint warnings only).
- [x] 26. `openspec validate 2026-04-29-plan-driven-authoring --strict` — valid.
- [ ] 27. Smoke: clean-room create of a security-review skill ends with
        class-driven references present and depth gates passed. (Requires LLM
        run; deferred to user verification.)
- [ ] 28. Smoke: import an existing skill via the `from-skill` seed and confirm
        the author loop converges in ≤2 turns. (Requires LLM run.)
- [ ] 29. Smoke: re-run depth-and-reliability change's Warden-style code-
        execution clean-room test (49/49 evals) under the new flow.
        (Requires LLM run.)
