# Agent Instructions

## Package Manager

Use **npm**: `npm install`, `npm run build`, `npm run typecheck`, `npm run check`, `npm run format`.

`npm run check` runs typecheck + lint + format — use it as the final gate before commits.

## Commit Attribution

AI commits MUST include:

```
Co-Authored-By: (agent model name) <email>
```

## File-Scoped Commands

| Task          | Command                                 |
| ------------- | --------------------------------------- |
| Typecheck     | `npm run typecheck`                     |
| Lint          | `npm run lint` (oxlint, type-aware)     |
| Format check  | `npm run format` (oxfmt --check)        |
| Format fix    | `npx oxfmt src/`                        |
| Build         | `npm run build`                         |
| Skill evals   | `dist/cli.js eval <skill-path>`         |
| One eval file | `npx vitest run path/to/file.eval.ts`   |

## Key Conventions

- Use OpenSpec for non-trivial changes. New work goes under `openspec/changes/<YYYY-MM-DD>-<slug>/` with `proposal.md`, `design.md`, `tasks.md`, and `specs/<capability>/spec.md` deltas. Validate with `npx openspec validate <id> --strict` before committing.
- spec.yaml is the source of truth for skills. SKILL.md and `evals/*.eval.ts` are derived; `skillet` regenerates them from spec.
- Eval files use the harness-first callback form: `describeEval(id, { harness }, (it) => { it("...", async ({ run, behavior }) => { ... }) })`. Code-level `expect(...)` for deterministic checks; named `toSatisfyJudge(<NameJudge>)` for semantic checks. Never use the legacy data-array `{ data: [...] }` shape for new generation.
- All LLM-bound work submits through `submitAiJob` in `src/agent/queue.ts` (concurrency + per-job timeout + telemetry). `completeWithBackoff` owns per-call transient retry; the queue does not retry on its own.
- Don't bypass hooks (`--no-verify`), don't `--force-push` to main, don't amend already-pushed commits without asking.
- Lint baseline: pre-existing warnings are allowed; new errors are not. Run `npm run lint` and confirm error count does not increase before committing.
- Prefer integration-style evals (`*.eval.ts` running through skilletHarness) over inline unit tests. Skillet's vitest config only collects `*.eval.ts`.
- Prefer hard cutover over backwards-compat shims unless the change crosses a published surface. When a shim is unavoidable, mark it `@deprecated` with a "remove in next minor" note.
- Minimize defensive programming — no fallbacks for systems expected to work. Trust internal contracts; only validate at system boundaries (user input, external APIs).
- Keep public surfaces small: fewer exported types/functions, fewer integration points, explicit contracts.
- Prefer composition over abstractions that add indirection without clear reuse.

## Engineering Principles

- Optimize for obvious code over flexible-but-indirect abstractions.
- Keep public interfaces small and intention-revealing.
- Let file/module structure carry context so names do not have to.
- Prefer domain language over mechanism language.
- Every exported function must have a brief JSDoc comment explaining its intent (the *why*, not the *what*).

## Policies

- `policies/README.md` (when to add a policy doc and how policy docs should stay scoped)
- `policies/code-comments.md` (repo default for code comments, docstrings, and exported-function JSDoc)
- `policies/policy-template.md` (template for adding new policy docs)

## Investigation-First Development

- Before implementing anything that depends on an external system (provider SDK, vitest internals, OpenSpec validator), read the relevant documentation or source first. State the constraint being relied on before writing code.
- Before removing an architectural layer, prove the replacement handles all known edge cases in a working proof-of-concept. Do not remove the incumbent until the replacement is verified end-to-end.
- When changing a function signature, error contract, or shared pattern, grep for all consumers and verify each one still works.
- If a fix attempt fails, stop. Re-read the error, trace the full system from input to output, and identify the root cause before trying another fix.

## Architecture Discipline

- `src/agent/` owns LLM call lifecycle (queue, backoff, tool-loop). Phases and commands submit jobs through `submitAiJob`; they do not call pi-ai's `complete` directly.
- `src/authoring/phases/` are the spec-author / eval-gen / skill-gen / skill-improve / spec-refine / reference-gen phases. Each phase is one file. Each LLM call in a phase is wrapped in `submitAiJob` with a name like `<phase>:<key>`.
- `src/spec/` is the source-of-truth schema and parser/validator. Patches go through `applyPatch` / `applyPatches` in `patcher.ts`; the parser and structural validator are independent so spec edits round-trip cleanly.
- `src/vitest-evals/` is the local mini-lib mirroring vitest-evals#41 (harness-first describeEval, judge factory, toSatisfyJudge matcher). Replaceable by the upstream package once it ships; the import path `@sentry/skillet/evals` is the contract.
- `src/eval/vitest-runner.ts` is the only place that spawns vitest. The custom YAML runner is gone.
- `src/cli.ts` parses global flags (queue config, --verbose) and dispatches to `src/commands/*`. Each command exports its `*_USAGE` constant; the dispatcher routes `--help`/`-h` to print usage before invoking the command body.
- Use `openspec/specs/<capability>/spec.md` as the canonical capability description; change deltas live under `openspec/changes/`. Don't duplicate spec content into AGENTS.md.

## Codex Execution Checklist

- Read local contracts first: this file, relevant `openspec/specs/*`, and the policy files this file enumerates.
- For any non-trivial change, write the OpenSpec change first (proposal + design + tasks + specs deltas). Validate strict before implementation.
- Derive explicit invariants before editing and keep them stable through implementation.
- Use an explicit sequence for non-trivial tasks: discover → minimal vertical slice → verify → summarize.
- Reuse existing repository patterns before introducing new abstractions.
- Treat completion as gated: `npm run check` clean, the change's `tasks.md` checked off, and OpenSpec validation strict-passing.

## Known OpenSpec Capabilities

Run `ls openspec/specs/` for the current list. As of writing:

- `agent` — LLM call lifecycle, queue, backoff
- `cli` — CLI flag parsing, command dispatch, end-of-command summary
- `eval-format` — `.eval.ts` file shape (harness-first callback form)
- `eval-linter` — eval file structural validation
- `judge` — LLM judge prompt + grade parsing
- `provider-autodiscovery` — env-based provider/model selection
- `skill-authoring` — spec-author / eval-gen / skill-gen / improve loop phases
- `skill-loader` — loading SKILL.md + references at runtime
- `structured-output` — JSON-output retry harness
- `validation` — spec.yaml structural validation
- `workspace` — temp workspace lifecycle for eval cases

In-flight changes live under `openspec/changes/`; archived changes under `openspec/changes/archive/`.
