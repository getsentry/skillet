# Workspace Specification

## Purpose

Workspaces provide the filesystem context in which an eval case runs. Every agent tool invocation (bash, read, write, etc.) operates within the workspace directory. Two modes exist: setup script (creates a fresh temp directory) and cwd (uses an existing directory as-is). No other modes are supported.

## Requirements

### Requirement: Setup Script Mode

When a workspace specifies a `setup` field, the system SHALL create a temporary directory and execute the setup script as a shell command within it before starting the agent.

#### Scenario: Basic setup with git repo
- GIVEN a workspace config:
  ```yaml
  workspace:
    setup: |
      git init
      echo "hello" > file.txt
      git add -A && git commit -m "init"
  ```
- WHEN the eval case starts
- THEN a new temporary directory is created
- AND the setup script runs in that directory via `sh -c`
- AND after setup, the directory contains an initialized git repo with file.txt committed
- AND the agent's working directory is set to this temp directory

#### Scenario: Setup script failure
- GIVEN a workspace setup script that exits with non-zero code
- WHEN the eval case starts
- THEN the eval case fails immediately with the setup error
- AND no agent interaction occurs

#### Scenario: Cleanup after eval
- GIVEN a workspace created via setup script
- WHEN the eval case completes (pass or fail)
- THEN the temporary directory is deleted

### Requirement: CWD Mode

When a workspace specifies a `cwd` field, the system SHALL use that path as the agent's working directory without creating or modifying anything.

#### Scenario: Absolute path
- GIVEN a workspace config `{ cwd: "/Users/greg/code/sentry" }`
- WHEN the eval case starts
- THEN the agent's working directory is set to `/Users/greg/code/sentry`
- AND no temp directory is created

#### Scenario: Environment variable expansion
- GIVEN a workspace config `{ cwd: "$SENTRY_REPO" }`
- WHEN `SENTRY_REPO` is set to `/Users/greg/code/sentry`
- THEN the agent's working directory is set to `/Users/greg/code/sentry`

#### Scenario: Missing environment variable
- GIVEN a workspace config `{ cwd: "$SENTRY_REPO" }`
- WHEN `SENTRY_REPO` is not set
- THEN the eval case is skipped with reason "workspace cwd: SENTRY_REPO not set"

#### Scenario: Path does not exist
- GIVEN a workspace config `{ cwd: "/nonexistent/path" }`
- WHEN the eval case starts
- THEN the eval case is skipped with reason "workspace cwd: path does not exist"

### Requirement: Default Workspace

When no workspace is specified, the system SHALL create an empty temporary directory.

#### Scenario: No workspace field
- GIVEN an eval case with no `workspace` field
- WHEN the eval case starts
- THEN a fresh empty temp directory is created and used
- AND it is cleaned up after the case completes

### Requirement: Workspace Isolation

Each eval case SHALL get its own workspace instance. Setup-mode workspaces MUST NOT share state between cases.

#### Scenario: Two cases with same setup
- GIVEN two eval cases both using `setup: "echo test > file.txt"`
- WHEN both cases run
- THEN each gets its own temp directory
- AND modifications made by one case's agent do not affect the other
