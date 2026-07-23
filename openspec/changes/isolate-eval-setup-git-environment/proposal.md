# Isolate Eval Setup Git Environment

## Why

Git hooks export repository-local variables such as `GIT_DIR` and `GIT_INDEX_FILE`. When Skillet runs an eval setup script from that environment, commands such as `git init` and `git add` can target the caller's repository or linked-worktree index instead of the disposable eval workspace.

## What Changes

- Remove repository-local Git variables from the setup subprocess environment.
- Add regression coverage proving setup Git commands initialize and stage only inside the eval workspace.
- Document the isolation boundary in the lifecycle and workspace contract.

## Impact

Setup scripts keep the normal process environment but resolve Git repositories from their workspace. No CLI or eval-case schema changes.
