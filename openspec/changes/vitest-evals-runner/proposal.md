# Proposal: vitest-evals-runner

## Why

Skillet's eval runner is a bespoke serial scheduler with bespoke reporting: it runs trials one at a time, prints its own summaries, and its JSON is a format only skillet understands. Meanwhile Sentry's own eval stack — getsentry/vitest-evals on top of Vitest — already owns scheduling, retries, judge plumbing, a local report UI (`vitest-evals serve`), a GitHub Actions reporter (summaries, annotations, Check Runs), and JUnit interop. Rebuilding any of that inside skillet is wasted effort, and staying bespoke leaves skillet outside the "evals are just tests" workflow Sentry advocates publicly.

## What Changes

- `skillet eval` executes cases through an embedded Vitest + vitest-evals engine instead of the hand-rolled serial loop in `src/evals/runner.ts`. Users never see vitest: no config files, no `.eval.ts` authoring, no new dependencies in the skill directory.
- Skillet compiles validated YAML cases into generated `.eval.ts` files in a per-run temp directory (never in the skill directory, never committed), binds them to a `createHarness` adapter wrapping skillet's existing workspace/install/sandbox/harness lifecycle, and drives Vitest programmatically (`startVitest` from `vitest/node`).
- The CLI contract is unchanged: same flags (`--case`, `--behavior`, `--trials`, `--baseline`, `--out`, `--dry`, `--verbose`, `--keep-workspaces`, `--sandbox`, `--harness`, `--json`), same `EvalJson` shape on stdout, same exit codes. `--dry` remains a pre-compile skillet-side analysis with no vitest involvement.
- New capability: `skillet eval --report <file>` writes a Vitest JSON report artifact consumable by `vitest-evals serve` and the `getsentry/vitest-evals@v0` GitHub Action, so skill evals get CI dashboards and a local report UI for free.
- `vitest`, `vitest-evals`, and their peers become bundled dependencies of `@sentry/skillet`. The skill directory stays dependency-free (Zero User Dependencies holds); the skillet package itself grows.
- Judge checks keep their current semantics (harness-graded, deterministic-first) — they run inside the generated tests via skillet's existing judge code, not vitest-evals judges, in this change. Migrating to vitest-evals judge objects is future work.

## Capabilities

### New Capabilities

- `eval-engine`: the embedded Vitest/vitest-evals execution engine — case compilation, the harness adapter, programmatic invocation, result mapping back to skillet's JSON contract, and report artifact emission.

### Modified Capabilities

- `cli`: the Eval Command requirement gains `--report <file>`; the Zero User Dependencies requirement is clarified — bundled means inside skillet's package, and generated engine files never land in the skill directory.
- `harness`: no requirement changes to invocation, installation, sandbox, model selection, or transcript capture — but the "Startup failures are errors" retry moves from skillet's loop into the engine layer. Requirement wording stays; this is called out to confirm the behavior is preserved, not respecified.

## Impact

- **Code**: `src/evals/runner.ts` (runCases + retry loop) is replaced by an engine module (`src/engine/`): compiler (cases → `.eval.ts`), harness adapter, vitest orchestrator, result mapper. `dryRun` moves out of runner.ts unchanged. `src/commands/eval.ts` swaps its `runCases` call; everything upstream of it (validation, filtering, `--out` cache) is untouched.
- **Dependencies**: `vitest@^4`, `vitest-evals`, peers (`ai`, `zod`, `tinyrainbow`) move skillet from 1 dependency to ~6; installed size grows by tens of MB. esbuild bundling keeps `packages: "external"` — vitest cannot be inlined (it spawns workers from its own package layout), so these ship as regular npm dependencies of the published package.
- **Behavior risk**: trial execution order changes (vitest may parallelize files); anything implicitly depending on serial order (progress line ordering, `--out` write timing) must hold under concurrency. Node floor: vitest 4 requires Node ≥20.
- **Not changed**: eval-format (YAML cases), skill-spec, validation, workspace, judge semantics, sandbox, status/instructions/show/init/new commands.
