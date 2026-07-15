# Design: vitest-evals-runner

## Architecture

```
skillet eval
  ├─ (unchanged) resolve root → load config → validate skill → filter cases
  ├─ (unchanged) --dry: dryRun(cases) — never touches the engine
  ├─ (unchanged) --out: partition cases into cached / remaining
  └─ engine (new, src/engine/)
       ├─ types.ts       WorkerCase (JSON-embedded config) + TrialMeta
       ├─ compile.ts     cases → generated .eval.mjs in mkdtemp dir,
       │                 importing dist/worker.js (bundled beside cli.js)
       ├─ worker.ts      runs in vitest workers: createHarness (spawn CLI in
       │                 workspace), createJudgeHarness + CriterionJudge,
       │                 per-trial tests with expect.soft checks, task.meta
       └─ orchestrate.ts startVitest("test", ...) config-less; custom reporter
                         reassembles TrialMeta → CaseResult[] → EvalJson
```

Spike evidence (2026-07-14, /tmp/skillet-vitest-spike): `createHarness` +
generated `.eval.ts` + `startVitest` from `vitest/node` runs workspace-shell
assertions and returns structured pass/fail in-process, no vitest CLI/config.

## Key decisions

### D1: Compile-to-tempdir, not authoring in TS

Users keep YAML cases (eval-format spec unchanged). The engine is a compiler
target. Rationale: authoring stayed the tool's contract; the runner is an
implementation detail. Terminal-bench-style case dirs remain possible later —
they'd compile to the same target.

### D2: One harness adapter, two bindings for baseline

vitest-evals binds one harness per `describeEval`. Baseline compiles each case
into two suites — `skill` and `baseline` bindings of the same adapter — and
lift math stays in skillet's existing `summarizeByBehavior`. Alternative
(vitest-evals-native comparison) doesn't exist upstream.

### D3: Results flow through task.meta, not stdout parsing

Each test records a `TrialMeta` (case id, variant, trial index,
`TrialResult`) into vitest `task.meta`; a custom reporter absorbs metas as
tests finish and reassembles `CaseResult[]` (feeding `--out` incremental
writes). Tests that die before recording (import failure, thrown hook) get a
synthesized error trial from the reporter's fallback path. The `--json`
contract is produced from the same types as today.

### D4: One vitest test per trial, native assertions

A case with N trials = N tests in the case's `describeEval` suite (plus N
baseline tests in a second suite when `--baseline`). Deterministic checks are
`expect.soft` assertions in the test body, so every failed check surfaces as
a real vitest assertion in reports and CI annotations — not an aggregated
blob. Baseline tests record results without asserting: a failing baseline is
the desired signal, not a test failure. Pass rates and lift stay in
skillet's `summarizeByBehavior`, computed from the reassembled CaseResults.
(Earlier draft aggregated N trials inside one test; rejected because it
reduced vitest-evals reporting to one opaque assertion per case.)

### D5: Serial by default inside vitest

Set `fileParallelism: false` + single worker initially: agent CLIs are
rate-limited and the old runner was serial, so behavior (progress ordering,
`--out` write order, machine load) is preserved. Concurrency becomes a flag
later without contract change.

### D6: Judges through vitest-evals' judge pipeline

`judge:` checks run as a vitest-evals judge: `createJudgeHarness` spawns the
same agent CLI with the grading prompt (no API keys — the CLI carries its
own auth), a `CriterionJudge` object wraps skillet's existing
`buildJudgePrompt`/`parseVerdict`, and the skill-variant test asserts via
`toSatisfyJudge` with threshold 1. Deterministic-first ordering is enforced
in the test body (judges skipped when any deterministic check failed).
Prompt text and verdict parsing are unchanged; the plumbing (scoring,
retry-on-unparseable, report visibility) is native. (Earlier draft kept
skillet's `runJudge` wholesale; superseded when the goal shifted to using
vitest-evals properly rather than as a scheduler shell.)

### D7: Dependency posture

`vitest`, `vitest-evals`, `ai`, `zod`, `tinyrainbow` become regular
dependencies (esbuild `packages: "external"` already treats deps as runtime
imports). Vitest cannot be bundled (worker spawning relies on its package
layout). Accepted cost: install size grows tens of MB; the npx-first, zero
user deps contract still holds because they're skillet's deps, not the
skill's. Pin vitest-evals exactly (0.x, in-house, movable floor).

### D8: --report is pass-through

`--report <file>` adds vitest's `json` reporter with `outputFile`. Skillet
does not transform the artifact; `vitest-evals serve` and the GitHub action
consume vitest JSON natively. Transcripts ride along because the adapter
returns them as session events.

## Risks

- **vitest programmatic API stability (v4)**: `startVitest` is public but
  config surface is wide; pin minor, cover with an integration test that runs
  a stub-harness case end-to-end in CI.
- **Worker/tempdir interplay**: generated files import skillet source (adapter)
  from the installed package; use absolute file URLs in generated imports so
  resolution works from a temp dir regardless of cwd.
- **Windows**: unchanged exposure (shell checks already assume POSIX sh);
  engine adds no new platform surface.
- **Perf**: vitest startup ~300-400ms per run (spike) — noise next to
  multi-minute agent trials.

## Migration

Single change, no flag gating: the old `runCases` path is deleted in the same
change once the engine passes the acceptance gate (the 11-case
getsentry-skills experiment reruns with identical outcomes). `dryRun` and
`results.ts` types move unchanged. `runner.test.ts` scenarios port to engine
tests; harness/install/sandbox/judge/workspace tests are untouched.
