# CLI Specification

## Purpose

`skillkit` is a self-contained CLI tool distributed as an npm package. It provides commands to create, evaluate, and iteratively improve agent skills. Users invoke it via `npx skillkit <command>` with zero project-level dependencies — skillkit bundles everything needed.

## Requirements

### Requirement: Package Distribution

The system SHALL be distributed as an npm package with a `skillkit` binary entry point, installable and runnable via `npx skillkit` without any prior project setup.

#### Scenario: First-time usage via npx
- GIVEN a user with Node.js installed and no local project
- WHEN the user runs `npx skillkit eval path/to/skill`
- THEN skillkit installs from npm, executes, and produces eval results
- AND no `node_modules` or `package.json` is created in the skill directory

### Requirement: Create Command

The system SHALL provide a `create` command that scaffolds a new skill with SKILL.md and initial eval cases using the built-in agent.

#### Scenario: Create skill with description argument
- GIVEN a user in any directory
- WHEN the user runs `npx skillkit create --name my-skill --description "Review Django access control"`
- THEN a directory `my-skill/` is created containing `SKILL.md` and `evals/` with at least one `.eval.yaml` file
- AND the SKILL.md contains valid frontmatter with name and description

#### Scenario: Create skill interactively
- GIVEN a user in any directory
- WHEN the user runs `npx skillkit create`
- THEN the agent asks what the skill should do
- AND generates the skill based on the conversation

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

### Requirement: Iterate Command

The system SHALL provide an `iterate` command that runs evals, feeds failures to the agent, and improves the skill in a loop.

#### Scenario: Iterate until passing
- GIVEN a skill with failing evals
- WHEN the user runs `npx skillkit iterate`
- THEN evals are run, failures are collected
- AND the agent modifies `SKILL.md` and/or references to address failures
- AND evals are re-run
- AND the loop repeats up to a configurable maximum (default 3)

#### Scenario: Iterate with all passing
- GIVEN a skill where all evals already pass
- WHEN the user runs `npx skillkit iterate`
- THEN the system reports all evals pass and exits cleanly

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
