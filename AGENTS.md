# Agent Instructions

## Package Manager

Use **npm**: `npm install`, `npm run build`, `npm run typecheck`, `npm run check`, `npm run format`.

`npm run check` runs typecheck + lint + format + unit tests — use it as the final gate before commits.

## Commit Attribution

AI commits MUST include:

```
Co-Authored-By: (agent model name) <email>
```

## Releases

- Release through `.github/workflows/release.yml`; choose `patch`, `minor`, `major`, or an explicit version. Use `force=true` only when the user explicitly asks to bypass blockers.
- Before dispatch, add the matching `CHANGELOG.md` section and run `npm run check`, `npm run docs:check`, and `npm run build`.
- Do not run `npm version`, create release branches or tags, or publish npm packages manually. Craft owns version bumps, the release branch, GitHub release, and npm publication.
- Approve the generated `getsentry/publish` request only after its release-branch CI passes, then verify the npm `latest` tag, GitHub release, and merged `main`.

## File-Scoped Commands

| Task          | Command                                 |
| ------------- | --------------------------------------- |
| Typecheck     | `npm run typecheck`                     |
| Lint          | `npm run lint` (oxlint + ast-grep)      |
| Format check  | `npm run format` (oxfmt --check)        |
| Format fix    | `npm run format:fix`                    |
| Unit tests    | `npm run test` (vitest, no LLM/network) |
| One test file | `npx vitest run src/spec/parser.test.ts`|
| Build         | `npm run build`                         |
| Skill evals   | `dist/cli.js eval <skill-path>` (spawns real agent CLIs — slow, needs codex or claude on PATH) |

## Key Conventions

- Use OpenSpec for non-trivial changes. New work goes under `openspec/changes/<slug>/` with `proposal.md`, `design.md`, `tasks.md`, and `specs/<capability>/spec.md` deltas. Validate with `npx openspec validate <id> --strict` before committing.
- **Skillet makes zero LLM calls.** The CLI is a file/state manager, validator, and mechanical eval runner. All generation happens in host agents, driven by the `skills/skillet-authoring` skill and `skillet instructions --json`. Do not add provider SDKs, API-key handling, or in-process agent loops.
- Per-skill artifacts: `spec.md` is the source of truth; `SKILL.md` and `evals/cases/*.yaml` are derived by agents and validated by the CLI. Skillet never regenerates or overwrites eval cases.
- Keep the CLI, user docs, lifecycle reference, and `skills/skillet-authoring` synchronized. Changes to commands, status/JSON, validation, artifact grammar, or eval semantics must update the surfaces that teach that behavior.
- Dogfood authoring changes with the freshly built CLI: run `npm run build`, inspect `dist/cli.js status skills/skillet-authoring --json`, fetch the touched `dist/cli.js instructions <artifact> ... --json`, edit the spec first for behavior changes, re-render `SKILL.md` with the current hash, update eval coverage, then run `validate` and `eval --dry`.
- Unit tests live next to their modules (`*.test.ts`) and must run offline in milliseconds. Anything spawning a real harness CLI is manual/dogfood territory (`examples/`), not the test suite.
- Don't bypass hooks (`--no-verify`), don't `--force-push` to main, don't amend already-pushed commits without asking.
- Lint gate: `npm run lint` runs oxlint with `--deny-warnings` plus ast-grep — it must be completely clean before committing.
- Prefer hard cutover over backwards-compat shims unless the change crosses a published surface.
- Minimize defensive programming — no fallbacks for systems expected to work. Trust internal contracts; only validate at system boundaries (user input, external APIs, spawned processes).
- Keep public surfaces small: fewer exported types/functions, fewer integration points, explicit contracts.

## Engineering Principles

- Optimize for obvious code over flexible-but-indirect abstractions.
- Keep public interfaces small and intention-revealing.
- Let file/module structure carry context so names do not have to.
- Prefer domain language over mechanism language.
- Every exported function must have a brief JSDoc comment explaining its intent (the *why*, not the *what*).

## Policies

- `policies/README.md` (when to add a policy doc and how policy docs should stay scoped)
- `policies/code-comments.md` (repo default for code comments, docstrings, and exported-function JSDoc)
- `policies/skill-creation-lifecycle.md` (keep `LIFECYCLE.md` current when the artifact flow changes)
- `policies/policy-template.md` (template for adding new policy docs)

## Investigation-First Development

- Before implementing anything that depends on an external system (codex/claude CLI flags, OpenSpec validator), read the relevant documentation or check the installed binary first. State the constraint being relied on before writing code.
- When changing a function signature, error contract, or shared pattern, grep for all consumers and verify each one still works.
- If a fix attempt fails, stop. Re-read the error, trace the full system from input to output, and identify the root cause before trying another fix.

## Architecture

The end-to-end artifact flow is documented in `LIFECYCLE.md`. Module ownership:

- `src/spec/` — the spec.md grammar: template, single-pass parser with line-accurate issues, slugs.
- `src/evals/` — case schema (`case.ts`), workspace lifecycle (`workspace.ts`), deterministic checks (`checks.ts`), agentless dry-run analysis (`runner.ts`), and result/lift math (`results.ts`).
- `src/engine/` — the embedded Vitest + vitest-evals eval engine: case compilation to generated test files (`compile.ts`), the in-worker harness/judge/test registration (`worker.ts`, bundled separately to `dist/worker.js`), programmatic orchestration + result reassembly (`orchestrate.ts`).
- `src/harness/` — everything that spawns agent CLIs: config resolution (`config.ts`), invocation building + process control (`run.ts`), skill installation per adapter (`install.ts`), the judge prompt/verdict protocol (`judge.ts`).
- `src/instructions/` — the writing guidance served by `skillet instructions` (hard budget: ≤200 lines per artifact).
- `src/commands/` — one file per CLI command; `src/cli.ts` is a lazy dispatch table.
- `src/status.ts` / `src/validate.ts` — the two cross-artifact aggregators (state from disk; full-skill validation report).
- Use `openspec/specs/<capability>/spec.md` as the canonical capability description. Don't duplicate spec content into AGENTS.md.

## Known OpenSpec Capabilities

Run `ls openspec/specs/` for the current list. In-flight changes live under `openspec/changes/`; archived changes under `openspec/changes/archive/`.
