# eval-engine Specification (delta)

## ADDED Requirements

### Requirement: Embedded Vitest execution engine

`skillet eval` SHALL execute eval cases by compiling them into generated Vitest test files bound to vitest-evals' `describeEval`/`createHarness` API and running them through Vitest's programmatic Node API in-process. The engine SHALL be invisible to users: no vitest config, no `.eval.ts` files, no lockfiles, and no dependencies appear in or are required of the skill directory.

#### Scenario: Engine files stay out of the skill directory

- **WHEN** `skillet eval` runs against a skill
- **THEN** generated test files and vitest artifacts live under a per-run temp directory that is removed afterward, and the skill directory's git status is unchanged

#### Scenario: No user-facing vitest surface

- **WHEN** a user runs `skillet eval` with any documented flag combination
- **THEN** no vitest terminology, config prompts, or vitest CLI flags are required or exposed; skillet's own output and flags are the entire interface

### Requirement: Case compilation

The engine SHALL translate each validated eval case into one generated test: the case's fixture/setup/prompt/timeout become harness input, `file_exists` and `shell` checks become assertions executed against the trial workspace, and `judge` checks retain deterministic-first semantics (skipped when any deterministic check failed). Compilation SHALL fail before any agent spawns if a case cannot be translated.

#### Scenario: Checks graded against the workspace

- **WHEN** a compiled case runs and the agent finishes
- **THEN** each check grades the trial workspace exactly as the eval-format spec defines (exit 0 shell = pass, path existence, harness-graded judge), and per-check results (kind, value, status, output) survive into the case result

#### Scenario: Trials multiply tests

- **WHEN** a case declares `trials: 3` or `--trials 3` is passed
- **THEN** the engine runs three independent harness trials for that case and the case result carries all three trial results

### Requirement: Harness adapter fidelity

The engine SHALL wrap skillet's existing harness lifecycle in a single vitest-evals harness adapter: fresh workspace per trial (fixture copy + setup script), skill installation for skill variants and none for baseline variants, sandboxed invocation when configured, transcript capture, and per-case timeout enforcement. Harness startup failures (nonzero exit) SHALL be retried once and then surface as trial errors, never as skill failures — identical to the pre-engine behavior.

#### Scenario: Baseline variant isolation

- **WHEN** `--baseline` compiles a case
- **THEN** every trial runs in both variants — with and without the skill installed — and lift is computed from their per-behavior pass rates exactly as before

#### Scenario: Timeout inside the engine

- **WHEN** an agent exceeds the case timeout during an engine run
- **THEN** the harness process is killed, the trial errors with a timeout message, and remaining tests still run

### Requirement: Result mapping preserves the JSON contract

The engine SHALL map vitest results back into skillet's existing `EvalJson` shape (summary, behaviors with pass rates and lift, per-case trials with checks and transcripts) so `--json` consumers observe no format change. Exit codes SHALL remain 0 when all trials pass and 1 otherwise.

#### Scenario: JSON output is engine-agnostic

- **WHEN** `skillet eval --json` runs on the same skill before and after this change
- **THEN** the emitted object validates against the same `EvalJson` shape with equivalent per-case and per-behavior content

#### Scenario: Incremental persistence still works

- **WHEN** `skillet eval --out results/` runs
- **THEN** each case's result file is written as that case finishes (atomic write-then-rename), and a rerun loads existing files instead of re-running those cases

### Requirement: Report artifact emission

`skillet eval --report <file>` SHALL write a Vitest JSON report artifact preserving vitest-evals metadata (scores, harness runs, transcripts) such that `vitest-evals serve <file>` renders it and the `getsentry/vitest-evals` GitHub Action can summarize it.

#### Scenario: Local report UI

- **WHEN** `skillet eval --report results.json` completes and `npx vitest-evals serve results.json` is run
- **THEN** the report UI lists the skill's cases with their outcomes and transcripts

#### Scenario: Report is opt-in

- **WHEN** `skillet eval` runs without `--report`
- **THEN** no report artifact is written anywhere
