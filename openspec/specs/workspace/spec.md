# Workspace Specification

## Purpose

Workspaces provide the filesystem context in which an eval case runs. Every agent tool invocation (bash, read, write, etc.) operates within the workspace directory. Two modes exist: setup script (creates a fresh temp directory) and cwd (uses an existing directory as-is). No other modes are supported.
## Requirements
### Requirement: Setup Script Mode

When an eval case specifies a `setup` field, the system SHALL create the workspace (fresh temp directory, with the case's fixture copied in first if declared) and execute the setup script with the workspace as working directory before spawning the agent. The script itself SHALL be materialized outside the workspace so it never appears in the workspace contents or its git state. Setup has a 30-second timeout; a non-zero exit marks the case errored without running the agent.

#### Scenario: Setup runs after fixture copy
- **WHEN** a case declares both `fixture: git-repo` and a `setup` script containing `git add -A && git commit -m init`
- **THEN** the fixture files are present when setup runs, and the resulting commit contains only fixture files — never the setup script itself

#### Scenario: Setup script failure
- **WHEN** the setup script exits non-zero
- **THEN** the case is marked errored with the script output, the agent is not spawned, and remaining cases still run

### Requirement: Workspace Isolation

Each trial of each case SHALL run in its own fresh temporary directory, removed after the run unless `--keep-workspaces` is passed. Trials never share state; baseline trials use separate workspaces from skill trials.

#### Scenario: Trials isolated
- **WHEN** a case runs with `--trials 3`
- **THEN** three independent workspaces are created and each is torn down after its trial

#### Scenario: Keep for debugging
- **WHEN** `skillet eval --keep-workspaces` runs
- **THEN** workspace paths are printed per case and left on disk

### Requirement: Fixture materialization

When a case declares `fixture: <slug>`, the contents of `evals/fixtures/<slug>/` SHALL be copied into the fresh workspace before setup runs. A missing fixture slug is a validation error, caught before any case runs.

#### Scenario: Fixture copied
- **WHEN** a case declares `fixture: monorepo` and `evals/fixtures/monorepo/` contains files
- **THEN** those files exist in the workspace when the agent starts

#### Scenario: Unknown fixture
- **WHEN** a case references a fixture slug with no matching directory
- **THEN** `skillet validate` and `skillet eval` fail before spawning any agent, naming the case and the missing fixture

### Requirement: Setup Git environment isolation

Setup scripts SHALL NOT inherit repository-local Git environment variables from the process that launched Skillet. Git commands in setup SHALL resolve repositories and indexes from the disposable workspace unless the setup script explicitly supplies another location.

#### Scenario: Eval launched from a linked-worktree hook

- **GIVEN** Skillet inherits `GIT_DIR`, `GIT_WORK_TREE`, and `GIT_INDEX_FILE` for a linked worktree
- **WHEN** a case setup script runs `git init` and `git add`
- **THEN** the setup creates and stages files in a repository inside the disposable eval workspace without modifying the linked worktree index

