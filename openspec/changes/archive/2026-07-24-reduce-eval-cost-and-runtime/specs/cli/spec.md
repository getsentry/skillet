# CLI Delta

## MODIFIED Requirements

### Requirement: Eval Command

`skillet eval [path]` SHALL run the skill's eval cases through the configured harness and report per-case and per-behavior results. It SHALL support `--case <id>` and `--behavior <id>` to filter, `--trials <n>` to run each case n times and report pass rates, `--baseline` to additionally run every trial without the skill installed and report per-behavior lift (skill pass rate minus baseline pass rate), `--concurrency <n>` to cap parallel trial and variant execution within one case, `--effort <level>` to set built-in reasoning effort, `--dry` to evaluate checks against the pristine workspace with no agent (flagging cases a do-nothing agent would pass), `--out <dir>` to persist each case's result as it finishes and resume from those files on rerun, `--report <file>` to write a Vitest JSON report artifact for the vitest-evals report UI and GitHub reporter, `--verbose` to print transcripts for non-passing trials, `--keep-workspaces`, `--sandbox docker|none`, `--harness <name>`, and `--json` for machine-readable results. Baseline SHALL remain opt-in.

#### Scenario: Filter by behavior
- **WHEN** `skillet eval --behavior branch-safety` runs
- **THEN** only cases whose `behavior` field is `branch-safety` execute

#### Scenario: Repeat trials
- **WHEN** `skillet eval --trials 5` runs
- **THEN** each selected case runs five independent trials and reports a pass rate

#### Scenario: Baseline omitted
- **WHEN** `skillet eval` runs without `--baseline`
- **THEN** each case runs only with the skill installed

#### Scenario: Baseline enabled
- **WHEN** `skillet eval --baseline` runs
- **THEN** each trial additionally runs without the skill installed and reports lift

#### Scenario: Concurrency override
- **WHEN** `skillet eval --concurrency 1` runs
- **THEN** cases execute serially even if configuration or defaults allow more parallelism

#### Scenario: Effort override
- **WHEN** `skillet eval --effort low` runs with a built-in harness
- **THEN** agent-under-test and judge invocations use low effort
