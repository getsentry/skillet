# Tasks

## Kernel extraction

- [x] 1. `src/agent/tool-loop.ts` exports `runToolLoop`. Pure refactor.
- [x] 2. `src/agent/loop.ts:runAgent` delegates the inner loop to
       `runToolLoop`. Eval-runtime semantics unchanged.
- [-] 3. Eval-suite regression check requires API keys — deferred to
       smoke run by user.

## Research scope

- [x] 4. `src/agent/scope.ts` exports `ResearchScope`, `buildScope`,
       `isInScope`, `wrapExecutorForScope`. Symlink resolution closes
       escape vector.
- [x] 5. `src/authoring/scope.ts` composes the scope in callers
       (bundled references + skill root + `--input` paths, CWD fallback).
- [-] 6. Scope-rejection unit test deferred — surface tested via the
       wrapping executor's error message; the rejection branch is plain
       prefix-matching code.

## Spec-author tool integration

- [x] 7. `createReadOnlyToolDefs()` in `src/agent/tools.ts` filters to
       `read_file`, `list_files`, `grep`.
- [x] 8. `runSpecAuthor` calls `runToolLoop` per turn with the read-only
       tool set and the scoped executor.
- [x] 9. Per-turn cap (`DEFAULT_MAX_TOOL_CALLS_PER_TURN = 30`). On hit,
       a nudge message is appended and a `maxToolCalls: 0` second pass
       forces terminal output. Per-session cap is per-process-invocation
       (resets on resume) — see design.md.
- [x] 10. `TurnPresentation.toolSummary` populated from per-turn counts;
        the CLI transport prints it.

## CLI surface

- [x] 11. `--input <path>` (repeatable, `--input=<path>` form too) on
        `skillet create`, `skillet spec init`, `skillet spec import`.
        Validated up front; error before any LLM call when missing.
- [x] 12. `SpecAuthorSession.inputPaths` persisted in the session file.
- [x] 13. `skillet resume` reads `inputPaths` from the session and
        recomposes the scope. Resume does not accept `--input`.

## Prompts

- [x] 14. `src/authoring/prompts/spec-author.ts` gained the
        Investigation section. Per-turn user message renders the
        research scope.

## Validation

- [x] 15. `npm run typecheck` — passes.
- [x] 16. `npm run check` — passes (0 errors).
- [x] 17. `openspec validate 2026-04-29-agentic-spec-author --strict` —
        valid.
- [ ] 18. Smoke: `skillet create "..." --input ./repo` end-to-end.
        (Requires LLM run.)
- [ ] 19. Smoke: scope wrapper rejection (deferred — see task 6).
- [ ] 20. Smoke: pause+resume round-trips tool-call message blocks.
        (Requires LLM run.)
- [ ] 21. Smoke: existing eval suite passes after kernel extraction.
        (Requires LLM run.)

## Docs

- [x] 22. `references/authoring-guidance.md` — left as-is; the
        `Spec-Author Loop` section added in the prior change is still
        accurate. Investigation specifics live in the prompt itself.
- [x] 23. `README.md` updated for `--input` flag.
