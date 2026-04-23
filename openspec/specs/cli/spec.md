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

The CLI SHALL support the following commands: `create`, `improve`, `eval`, `validate`. The `iterate` command is removed. The `create` and `improve` commands are agentic (LLM-driven). The `eval` and `validate` commands are mechanical.

#### Scenario: Create command
- **WHEN** `skillkit create "description of skill"` is run
- **THEN** the system creates a new skill directory with SKILL.md, generates evals, runs them, and iterates

#### Scenario: Create with explicit path
- **WHEN** `skillkit create "description" --path ./my-skill` is run
- **THEN** the skill is created at the specified path

#### Scenario: Create fails if SKILL.md exists
- **WHEN** `skillkit create` targets a directory that already contains SKILL.md
- **THEN** the command exits with an error suggesting `skillkit improve` instead

#### Scenario: Improve command
- **WHEN** `skillkit improve [path]` is run in a directory with SKILL.md
- **THEN** the system reads the existing skill, generates/adds evals, optionally refines the skill, and iterates

#### Scenario: Improve fails if no SKILL.md
- **WHEN** `skillkit improve` targets a directory with no SKILL.md
- **THEN** the command exits with an error suggesting `skillkit create` instead

#### Scenario: Eval command with JSON
- **WHEN** `skillkit eval [path] --json` is run
- **THEN** structured JSON results are written to stdout

#### Scenario: Validate command
- **WHEN** `skillkit validate [path]` is run
- **THEN** structural validation runs and reports errors (if any) with exit code 0 for valid, 1 for invalid

#### Scenario: Help text
- **WHEN** `skillkit --help` is run
- **THEN** all four commands are listed with brief descriptions

### Requirement: Eval Command

The system SHALL provide an `eval` command that discovers and runs all eval cases for a skill, reporting pass/fail results.

#### Scenario: Run evals from skill directory
- GIVEN a skill directory with `SKILL.md` and `evals/*.eval.yaml`
- WHEN the user runs `npx skillkit eval`
- THEN all eval cases across all `.eval.yaml` files are executed
- AND results are printed with pass/fail status per case
- AND exit code is 0 if all pass, 1 if any fail

#### Scenario: Run evals with explicit path
- GIVEN a skill at `path/to/my-skill/`
- WHEN the user runs `npx skillkit eval path/to/my-skill`
- THEN evals are discovered relative to that path

#### Scenario: Skip evals with missing requirements
- GIVEN an eval case with `requires: [env: SENTRY_REPO]`
- WHEN the `SENTRY_REPO` environment variable is not set
- THEN that eval case is skipped (not failed)
- AND the skip reason is reported

### Requirement: LLM Provider Configuration

The system SHALL auto-detect the LLM provider from environment variables and support explicit override.

#### Scenario: Auto-detect from ANTHROPIC_API_KEY
- GIVEN `ANTHROPIC_API_KEY` is set in the environment
- WHEN any command that requires LLM access runs
- THEN the Anthropic provider is used

#### Scenario: Auto-detect from OPENAI_API_KEY
- GIVEN `OPENAI_API_KEY` is set (and `ANTHROPIC_API_KEY` is not)
- WHEN any command runs
- THEN the OpenAI provider is used

#### Scenario: No API key available
- GIVEN no LLM provider API key is set
- WHEN the user runs any command requiring LLM access
- THEN a clear error is printed listing supported environment variables
- AND exit code is 1

#### Scenario: Explicit model override
- GIVEN the `SKILLKIT_MODEL` environment variable is set to a specific model ID
- WHEN any command runs
- THEN that model is used instead of the default

### Requirement: Zero User Dependencies

The system MUST NOT require the user to install any packages, tools, or runtimes beyond Node.js. All dependencies (AI SDK, YAML parser, tool implementations, judge logic) SHALL be bundled within the skillkit package.

#### Scenario: Skill directory stays clean
- GIVEN a skill directory containing only `SKILL.md` and `evals/`
- WHEN the user runs `npx skillkit eval`
- THEN no files are created in the skill directory (no node_modules, no lock files, no configs)
