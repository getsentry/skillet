# cli Specification (delta)

## MODIFIED Requirements

### Requirement: Eval Command

`skillet eval [path]` SHALL run the skill's eval cases through the configured harness and report per-case and per-behavior results. It SHALL support `--case <id>` and `--behavior <id>` to filter, `--trials <n>` to run each case n times and report pass rates, `--baseline` to additionally run every trial without the skill installed and report per-behavior lift (skill pass rate minus baseline pass rate), `--dry` to evaluate checks against the pristine workspace with no agent (flagging cases a do-nothing agent would pass), `--out <dir>` to persist each case's result as it finishes and resume from those files on rerun, `--report <file>` to write a Vitest JSON report artifact for the vitest-evals report UI and GitHub reporter, `--verbose` to print transcripts for non-passing trials, `--keep-workspaces`, `--sandbox docker|none`, `--harness <name>`, and `--json` for machine-readable results.

#### Scenario: Basic run

- **WHEN** `skillet eval ./commit-helper` runs
- **THEN** each case in `evals/cases/` executes through the harness and results are grouped by behavior with pass/fail per check

#### Scenario: Trials reporting

- **WHEN** `skillet eval --trials 5` runs
- **THEN** each case executes five times and output reports pass rates (e.g. 4/5) per case

#### Scenario: Dry run finds vacuous cases

- **WHEN** `skillet eval --dry` runs on a case whose deterministic checks all pass against the untouched workspace
- **THEN** the case is flagged as passable by a do-nothing agent, no agent is spawned, and the command exits 0 (advisory)

#### Scenario: Interrupted run resumes

- **WHEN** `skillet eval --out results/` is re-run after an interrupted run wrote some case files
- **THEN** existing case results are loaded instead of re-run and only missing cases execute

#### Scenario: Baseline lift

- **WHEN** `skillet eval --trials 5 --baseline` runs
- **THEN** each case executes five times with the skill and five times without, and output reports per-behavior lift with both pass rates

#### Scenario: Report artifact for CI and UI

- **WHEN** `skillet eval --report results.json` runs
- **THEN** a Vitest JSON report is written to that path, consumable by `vitest-evals serve` and the `getsentry/vitest-evals` GitHub Action, alongside skillet's normal output

### Requirement: Zero User Dependencies

The system MUST NOT require the user to install any packages, tools, or runtimes beyond Node.js. All dependencies — the YAML parser, the embedded Vitest/vitest-evals eval engine, and all tool logic — SHALL be dependencies of the skillet package itself, resolved from skillet's own installation. Skillet makes zero LLM calls, and judge grading goes through the harness CLI. Engine machinery (generated test files, vitest caches) MUST NOT be written into the skill directory.

#### Scenario: Skill directory stays clean

- GIVEN a skill directory containing only `SKILL.md` and `evals/`
- WHEN the user runs `npx @sentry/skillet eval`
- THEN no files are created in the skill directory (no node_modules, no lock files, no configs, no generated test files)
