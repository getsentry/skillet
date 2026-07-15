# Tasks: vitest-evals-runner

## 1. Dependencies and scaffolding

- [x] 1.1 Add `vitest@^4`, `vitest-evals` (exact pin), and peers `ai`, `zod`, `tinyrainbow` as dependencies; confirm `npm run build` still bundles cli with `packages: "external"` and `dist/cli.js` runs
- [x] 1.2 Create `src/engine/` module skeleton (types, compile, worker, orchestrate; worker gets its own esbuild bundle at dist/worker.js)

## 2. Worker (harness adapter + tests)

- [x] 2.1 Implement worker harness: `createHarness` spawning the agent CLI in a fresh workspace (fixture+setup), skill install for skill variant only, sandbox/timeout via `runHarness`, startup-failure retry-once, transcript as session events, output `{workspaceDir, transcript, durationMs, error?}`
- [x] 2.2 Deterministic checks as `expect.soft` assertions per trial test; judges as vitest-evals `CriterionJudge` + `createJudgeHarness` (agent CLI as judge model) via `toSatisfyJudge`, deterministic-first ordering preserved; baseline suite records without asserting

## 3. Compiler and orchestrator

- [x] 3.1 Implement `compile.ts`: cases → one generated `.eval.mjs` per case in `mkdtemp` dir importing the bundled worker by absolute URL; WorkerCase embedded as JSON
- [x] 3.2 Implement `orchestrate.ts`: config-less `startVitest` (tempdir root, `fileParallelism: false`, maxWorkers 1, testTimeout 0), custom reporter absorbing TrialMeta with fallback synthesis for meta-less failures, optional `--report` json reporter
- [x] 3.3 CaseResult reassembly feeds existing `summarizeByBehavior`; `onCaseDone` fires per finished case for `--out` incremental writes

## 4. Command integration

- [x] 4.1 Swap `src/commands/eval.ts` from `runCases` to `runEngine`; keep `--dry`, filtering, `--out` cache partition, `EvalJson` emission and exit codes; add `--report <file>` flag + help text
- [x] 4.2 Delete `runCases`/retry from `src/evals/runner.ts` (keep `dryRun`, `DryCaseResult`); update imports

## 5. Tests and validation

- [x] 5.1 Engine integration tests (`src/engine/orchestrate.test.ts`): pass/fail grading, setup-failure isolation, judge skip on deterministic failure, nonzero-exit-as-error, baseline + trials, onCaseDone exactly-once, report artifact — all through real nested `startVitest` with stub sh harnesses
- [x] 5.2 Port still-relevant `runner.test.ts` scenarios (dryRun + summarizeByBehavior stay; runCases scenarios moved to 5.1); `npm run check` green
- [x] 5.3 Acceptance: rerun the 11-case getsentry-skills experiment (commit, create-branch, agents-md) through the engine via codex; outcomes match the 2026-07-14 baseline (11/11), `--report` artifact opens in `vitest-evals serve`

## 6. Docs

- [x] 6.1 Update README eval section and LIFECYCLE.md for `--report`; note the report UI and GitHub action integration
