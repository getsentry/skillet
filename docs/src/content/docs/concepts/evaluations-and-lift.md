---
title: Understand Eval Results
description: Compare case results with and without a skill.
type: conceptual
summary: Baseline runs use the same cases without the skill. Lift is the difference between the two pass rates.
---

Skillet evals run prompts through a coding-agent CLI in fresh workspaces. Results apply only to the prompts, checks, harness, configuration, and trials in that run. Use them to compare tested outcomes and decide what to inspect next, not to grade the overall quality or accuracy of a skill.

## Trials

One run is one observation. When you need to inspect variance or a behavior has
shown inconsistent results, choose a trial count for that question:

```bash
skillet eval --trials <n>
```

Skillet reports pass rates per case and per behavior. Do not add repeated trials
by default; they increase runtime and model usage.

## Baseline

A passing case shows that the agent met the case with the skill installed. Run a baseline to see whether the result changes without the skill.

```bash
skillet eval --baseline
```

Baseline trials use the same prompt, harness, model selection, and global agent configuration without installing the skill.

Lift is the difference between the skill pass rate and the baseline pass rate.
Add `--trials <n>` when the comparison itself needs repeated observations.

## Zero Lift

Zero lift means the skill and baseline had the same pass rate in these runs.

- A high pass rate for both means the configured agent already met the tested cases.
- A low pass rate for both means the skill did not change those results.

Review the case results, transcripts, and checks before deciding what to change.

## Dry Runs

```bash
skillet eval --dry
```

A dry run applies deterministic checks before an agent changes the workspace. If a check already passes, it may not test the agent's work.

Dry runs cannot assess judge checks and do not replace baseline measurement.

## Runtime and Cost

Skillet keeps cases ordered and runs up to four trials or skill/baseline variants
within one case in parallel. Set `--concurrency 1` for serial execution or a
higher value up to `8` when the machine and agent service can support it.

Built-in Codex and Claude trials and judges default to low effort while using
the CLI's configured/default model. Use `--effort low` for cheaper exploratory
runs or configure `effort` in `.skillet.yaml`. Parallelism reduces elapsed time,
not total model usage. Baseline remains opt-in because it doubles trial variants.

## Errors and Failures

- **Fail:** the agent completed, but one or more checks did not pass.
- **Error:** setup, process execution, timeout, or judge protocol failed.

Keep those outcomes separate. Treat a harness authentication failure as an infrastructure error, not a case result.
