# Tasks

## Kernel extraction

- [ ] 1. Add `src/agent/tool-loop.ts` exporting `runToolLoop(opts)` with
       the LLM↔tool inner cycle. Pure refactor — eval-runtime semantics
       unchanged.
- [ ] 2. Update `src/agent/loop.ts:runAgent` to delegate the inner loop to
       `runToolLoop`. Eval system prompt building, per-turn iteration, and
       transcript normalization stay in `runAgent`.
- [ ] 3. Run the existing eval suite locally (or `skillet eval` against a
       reference skill) to confirm zero regressions.

## Research scope

- [ ] 4. Add `src/agent/scope.ts` exporting `ResearchScope` (a list of
       absolute paths) and `wrapExecutorForScope(executor, scope)` that
       rejects out-of-scope paths before delegating.
- [ ] 5. Compose scope in spec-author callers: bundled references + target
       skill root (if exists) + `--input` paths, falling back to CWD when
       no `--input`.
- [ ] 6. Test scope rejection: a tool call to `/etc/passwd` returns a
       "path outside research scope" error without touching the FS.

## Spec-author tool integration

- [ ] 7. Define a read-only tool subset in `src/agent/tools.ts` (or a new
       module): `read_file`, `list_files`, `grep`. Reuse existing
       executors. Excluded: `bash`, `write_file`, `edit_file`.
- [ ] 8. Update `src/authoring/phases/spec-author.ts` to call
       `runToolLoop` per turn instead of `completeWithBackoff` directly.
       The kernel's terminal text becomes the input to the existing
       JSON-turn parser.
- [ ] 9. Add per-turn (`maxToolCalls`) and per-session
       (`maxSessionToolCalls`) caps. When exceeded, inject a synthetic
       "tool budget reached" user message and force terminal output.
- [ ] 10. Surface a one-line tool-call summary in the CLI's
       `presentTurn` output (e.g., `tools: 3× read_file, 1× grep`).

## CLI surface

- [ ] 11. Add `--input <path>` (repeatable) to `skillet create`, `skillet
        spec init`, `skillet spec import`. Resolve to absolute paths;
        error if a path does not exist.
- [ ] 12. Persist `inputPaths: string[]` in the session file so resume
        gets the same scope.
- [ ] 13. `skillet resume` re-builds the scope from the persisted
        `inputPaths` (no `--input` flag on resume — scope is fixed at
        session start).

## Prompts

- [ ] 14. Update `src/authoring/prompts/spec-author.ts` to add the
        Investigation section (read-before-proposing, cite evidence,
        stop on diminishing returns) and to render the research scope
        list.

## Validation

- [ ] 15. `npm run typecheck`
- [ ] 16. `npm run check`
- [ ] 17. `openspec validate 2026-04-29-agentic-spec-author --strict`
- [ ] 18. Smoke: `skillet create "django security review" --input
        ./some-django-repo` produces a spec whose behaviors cite
        specific files from the input.
- [ ] 19. Smoke: scope wrapper rejects out-of-scope paths in a unit
        test or scripted run.
- [ ] 20. Smoke: pause+resume still works — pending session round-trips
        tool-call/tool-result message blocks intact.
- [ ] 21. Smoke: existing eval suite passes after kernel extraction.

## Docs

- [ ] 22. Update `references/authoring-guidance.md` to mention the
        agent's research capability and the `--input` flag.
- [ ] 23. Update `README.md` create-flow section.
