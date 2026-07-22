---
title: Understand Eval Results
description: Compare case results with and without a skill.
type: conceptual
summary: Baseline runs use the same cases without the skill. Lift is the difference between the two pass rates.
---

Skillet evals run prompts through a coding-agent CLI in fresh workspaces. Results apply only to the prompts, checks, harness, configuration, and trials in that run. Use them to compare tested outcomes and decide what to inspect next, not to grade the overall quality or accuracy of a skill.

## Trials

One run can be lucky. Repeated trials show how consistently the behavior appears across runs:

```bash
skillet eval --trials 3
```

Skillet reports pass rates per case and per behavior.

## Baseline

A passing case shows that the agent met the case with the skill installed. Run a baseline to see whether the result changes without the skill.

```bash
skillet eval --trials 3 --baseline
```

Baseline trials use the same prompt, harness, model selection, and global agent configuration without installing the skill.

```text
Behaviors:
  conventional-subject: 100% (3/3) | baseline 33% | lift +67%
  branch-safety:        100% (3/3) | baseline 0%  | lift +100%
```

Lift is the difference between the skill pass rate and the baseline pass rate.

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

## Errors and Failures

- **Fail:** the agent completed, but one or more checks did not pass.
- **Error:** setup, process execution, timeout, or judge protocol failed.

Keep those outcomes separate. Treat a harness authentication failure as an infrastructure error, not a case result.
