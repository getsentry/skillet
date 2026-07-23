# CLI Specification

## Purpose

`skillet` is a self-contained CLI tool distributed as an npm package. It provides commands to create, improve, evaluate, and validate agent skills. Users invoke it via `npx @sentry/skillet <command>` with zero project-level dependencies — skillet bundles everything needed.
## Requirements
### Requirement: Package Distribution

The system SHALL be distributed as an npm package with a `skillet` binary entry point, installable and runnable via `npx @sentry/skillet` without any prior project setup.

#### Scenario: First-time usage via npx
- GIVEN a user with Node.js installed and no local project
- WHEN the user runs `npx @sentry/skillet eval path/to/skill`
- THEN skillet installs from npm, executes, and produces eval results
- AND no `node_modules` or `package.json` is created in the skill directory

### Requirement: CLI command surface

The CLI SHALL support exactly seven commands, all mechanical (no LLM calls): `init` (set up the authoring skill via @sentry/dotagents), `new <name>` (scaffold a skill directory with a spec.md template), `status` (artifact state for a skill), `instructions <artifact>` (serve templates and writing instructions to agents), `validate` (structural validation), `eval` (run eval cases through the harness), and `show` (pretty-print a skill's spec and coverage). The commands `create`, `improve`, `spec`, `add-eval`, `resume`, `compare`, and `install` are removed.

#### Scenario: New skill scaffold
- **WHEN** `skillet new commit-helper` runs
- **THEN** a `commit-helper/` directory is created containing a templated `spec.md` and empty `evals/cases/` and `evals/fixtures/` directories

#### Scenario: Removed command
- **WHEN** `skillet create "some skill"` runs
- **THEN** the CLI exits non-zero with a message pointing to the agent-driven workflow (`/skillet:propose`) and `skillet new`

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

### Requirement: Version flag

`skillet --version` (and `-v`) SHALL print the package version to stdout and exit 0.

#### Scenario: Version probe
- **WHEN** `skillet --version` runs
- **THEN** stdout is the version string alone

### Requirement: JSON output convention

Every command SHALL support `--json`, emitting exactly one JSON object on stdout with no ANSI escapes; human-readable prose goes to stderr. Failure paths emit `{ok: false, error}` so scripted consumers never see empty stdout. Exit codes: 0 success, 1 failure (including validation errors and eval failures).

#### Scenario: Machine-readable validate
- **WHEN** `skillet validate --json` runs on an invalid skill
- **THEN** stdout is a single JSON object listing issues with severity, path, and message, and the exit code is 1

### Requirement: Current version recommendation

For valid commands other than help and version output, Skillet SHALL check the npm `latest` release in the background at most once per 24-hour cache window. When the running version is older, Skillet SHALL let the command finish normally and then recommend `npx -y @sentry/skillet@latest` on stderr. Registry and cache failures SHALL NOT change command output, exit status, or availability.

#### Scenario: Outdated installed binary

- **GIVEN** the running Skillet version is older than npm's latest release
- **WHEN** a valid command completes
- **THEN** its normal output and exit status are preserved
- **AND** stderr identifies both versions and recommends `npx -y @sentry/skillet@latest`

#### Scenario: Registry unavailable

- **WHEN** the update request times out or fails
- **THEN** the selected command completes without an update-check error

#### Scenario: Help or version request

- **WHEN** the user requests top-level help or version output
- **THEN** Skillet returns it without checking the registry

