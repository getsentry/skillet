# CLI Specification

## Purpose

`skillkit` is a self-contained CLI tool distributed as an npm package. It provides commands to create, improve, evaluate, and validate agent skills. Users invoke it via `npx skillkit <command>` with zero project-level dependencies — skillkit bundles everything needed.
## Requirements
### Requirement: Package Distribution

The system SHALL be distributed as an npm package with a `skillkit` binary entry point, installable and runnable via `npx skillkit` without any prior project setup.

#### Scenario: First-time usage via npx
- GIVEN a user with Node.js installed and no local project
- WHEN the user runs `npx skillkit eval path/to/skill`
- THEN skillkit installs from npm, executes, and produces eval results
- AND no `node_modules` or `package.json` is created in the skill directory

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

### Requirement: Zero User Dependencies

The system MUST NOT require the user to install any packages, tools, or runtimes beyond Node.js. All dependencies (AI SDK, YAML parser, tool implementations, judge logic) SHALL be bundled within the skillkit package.

#### Scenario: Skill directory stays clean
- GIVEN a skill directory containing only `SKILL.md` and `evals/`
- WHEN the user runs `npx skillkit eval`
- THEN no files are created in the skill directory (no node_modules, no lock files, no configs)

### Requirement: JSON output convention

Every command SHALL support `--json`, emitting exactly one JSON object on stdout with no ANSI escapes; human-readable prose goes to stderr. Exit codes: 0 success, 1 failure (including validation errors and eval failures).

#### Scenario: Machine-readable validate
- **WHEN** `skillet validate --json` runs on an invalid skill
- **THEN** stdout is a single JSON object listing issues with severity, path, and message, and the exit code is 1

