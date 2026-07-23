# Design

## Process Boundary

`createWorkspace` copies the current process environment for setup scripts, then removes the repository-local variables listed by `git rev-parse --local-env-vars`. User identity, SSH configuration, PATH, and unrelated environment values remain available.

The cleanup belongs at the setup subprocess boundary rather than in Git hooks: evals may be launched from hooks, IDEs, wrappers, or any other process that carries repository-local Git state.

## Regression Coverage

The workspace test points `GIT_DIR`, `GIT_WORK_TREE`, and `GIT_INDEX_FILE` at a source repository, runs a setup script containing `git init` and `git add`, and requires a new `.git` directory inside the disposable workspace.
