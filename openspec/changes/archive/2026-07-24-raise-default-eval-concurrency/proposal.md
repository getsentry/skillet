# Raise Default Eval Concurrency

## Why

The bounded parallel execution path is designed for isolated trial workspaces, and a default of two leaves avoidable wall-clock latency for repeated trials and skill/baseline comparisons on typical development machines.

## What Changes

- Raise default trial/variant concurrency from two to four.
- Keep cases ordered and retain the existing `1` through `8` override range.
- Strengthen engine coverage to prove four trials overlap under default settings.

## Impact

Default evals may run up to four agent processes at once when a case has enough trials or variants. Total model usage does not change. Users can set `concurrency: 1` or pass `--concurrency 1` for serial execution.
