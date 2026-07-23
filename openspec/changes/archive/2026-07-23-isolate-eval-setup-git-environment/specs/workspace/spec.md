# Workspace Delta

## ADDED Requirements

### Requirement: Setup Git environment isolation

Setup scripts SHALL NOT inherit repository-local Git environment variables from the process that launched Skillet. Git commands in setup SHALL resolve repositories and indexes from the disposable workspace unless the setup script explicitly supplies another location.

#### Scenario: Eval launched from a linked-worktree hook

- **GIVEN** Skillet inherits `GIT_DIR`, `GIT_WORK_TREE`, and `GIT_INDEX_FILE` for a linked worktree
- **WHEN** a case setup script runs `git init` and `git add`
- **THEN** the setup creates and stages files in a repository inside the disposable eval workspace without modifying the linked worktree index
