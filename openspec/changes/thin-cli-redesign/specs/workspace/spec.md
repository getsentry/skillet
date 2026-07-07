# Workspace Delta

## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Fixture materialization

When a case declares `fixture: <slug>`, the contents of `evals/fixtures/<slug>/` SHALL be copied into the fresh workspace before setup runs. A missing fixture slug is a validation error, caught before any case runs.

#### Scenario: Fixture copied
- **WHEN** a case declares `fixture: monorepo` and `evals/fixtures/monorepo/` contains files
- **THEN** those files exist in the workspace when the agent starts

#### Scenario: Unknown fixture
- **WHEN** a case references a fixture slug with no matching directory
- **THEN** `skillet validate` and `skillet eval` fail before spawning any agent, naming the case and the missing fixture

## REMOVED Requirements

### Requirement: CWD Mode
**Reason**: Running evals in an existing user directory mutates real state and made results non-reproducible; every run now gets a fresh temp workspace.
**Migration**: Move any needed pre-existing files into a fixture directory.

### Requirement: Default Workspace
**Reason**: Obsolete alongside CWD mode; the default is now always a fresh empty temp directory.
**Migration**: None; cases without `fixture`/`setup` get an empty workspace automatically.
