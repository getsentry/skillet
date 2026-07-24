# Lower Default Eval Effort

## Why

Eval runs can spawn both agent-under-test and judge sessions, and optional baseline variants multiply that work. Medium reasoning remains available, but low effort is a better cost-conscious default for routine skill evaluation.

## What Changes

- Change the default built-in Codex and Claude effort from medium to low.
- Keep explicit `--effort` and `.skillet.yaml` overrides unchanged.
- Continue leaving model selection to the user's agent CLI unless explicitly configured.

## Impact

Unconfigured built-in evals use a lower reasoning budget. Users can select medium, high, or xhigh when a case requires deeper reasoning.
