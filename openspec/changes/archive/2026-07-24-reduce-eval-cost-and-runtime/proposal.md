# Reduce Eval Cost and Runtime

## Why

A single trial can include both an agent-under-test session and a judge session; opt-in baseline doubles that work. Skillet currently runs every case serially and inherits each agent CLI's user-level reasoning setting, which can make evals slow and unexpectedly expensive.

## What Changes

- Run up to two trials or skill/baseline variants within one case in parallel by default, with `--concurrency` and `.skillet.yaml` overrides.
- Keep case files ordered so the configured concurrency is the total agent-process load.
- Set built-in Codex and Claude sessions to medium reasoning effort by default, including judges.
- Add `--effort` and `.skillet.yaml` overrides for built-in harnesses.
- Continue using the user's configured/default model unless a model suffix is explicitly selected.
- Keep baseline opt-in.

## Impact

Parallelism reduces wall-clock time but not total model usage. Medium effort lowers the default reasoning budget relative to high-effort user configurations. Custom harness commands receive no injected effort flags.
