# CLI Delta

## MODIFIED Requirements

### Requirement: CLI command surface

The CLI SHALL support exactly seven commands, all mechanical (no LLM calls): `init` (scaffold project/tool integrations), `new <name>` (scaffold a skill directory with a spec.md template), `status` (artifact state for a skill), `instructions <artifact>` (serve templates and writing instructions to agents), `validate` (structural validation), `eval` (run eval cases through the harness), and `show` (pretty-print a skill's spec and coverage). The commands `create`, `improve`, `spec`, `add-eval`, `resume`, `compare`, and `install` are removed.

#### Scenario: New skill scaffold
- **WHEN** `skillet new commit-helper` runs
- **THEN** a `commit-helper/` directory is created containing a templated `spec.md` and empty `evals/cases/` and `evals/fixtures/` directories

#### Scenario: Removed command
- **WHEN** `skillet create "some skill"` runs
- **THEN** the CLI exits non-zero with a message pointing to the agent-driven workflow (`/skillet:propose`) and `skillet new`

### Requirement: Eval Command

`skillet eval [path]` SHALL run the skill's eval cases through the configured harness and report per-case and per-behavior results. It SHALL support `--case <id>` to run a single case, `--trials <n>` to run each case n times and report pass rates, `--baseline` to additionally run every trial without the skill installed and report per-behavior lift (skill pass rate minus baseline pass rate), and `--json` for machine-readable results.

#### Scenario: Basic run
- **WHEN** `skillet eval ./commit-helper` runs
- **THEN** each case in `evals/cases/` executes through the harness and results are grouped by behavior with pass/fail per check

#### Scenario: Trials reporting
- **WHEN** `skillet eval --trials 5` runs
- **THEN** each case executes five times and output reports pass rates (e.g. 4/5) per case

#### Scenario: Baseline lift
- **WHEN** `skillet eval --trials 5 --baseline` runs
- **THEN** each case executes five times with the skill and five times without, and output reports per-behavior lift with both pass rates

## ADDED Requirements

### Requirement: JSON output convention

Every command SHALL support `--json`, emitting exactly one JSON object on stdout with no ANSI escapes; human-readable prose goes to stderr. Exit codes: 0 success, 1 failure (including validation errors and eval failures).

#### Scenario: Machine-readable validate
- **WHEN** `skillet validate --json` runs on an invalid skill
- **THEN** stdout is a single JSON object listing issues with severity, path, and message, and the exit code is 1

## REMOVED Requirements

### Requirement: LLM Provider Configuration
**Reason**: Skillet no longer calls LLM providers; there is nothing to configure. Judges and eval agents run through the harness CLIs, which manage their own auth.
**Migration**: Delete all `SKILLET_*` environment variables. Configure harness choice in `.skillet.yaml` (`harness: codex|claude` or a custom command template).
