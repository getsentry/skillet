---
title: Evaluations and Lift
description: Measure whether a skill changes agent behavior rather than merely passing a demonstration.
type: conceptual
summary: Cases run with and without the skill so the result includes baseline pass rate and lift.
---

Skillet evals run realistic prompts through a coding-agent CLI in fresh workspaces. The result is graded from the workspace state, not from whether the response sounded convincing.

## Trials

One run can be lucky. Repeated trials show how consistently the behavior appears across runs:

```bash
skillet eval --trials 3
```

Skillet reports pass rates per case and per behavior.

## Baseline

A passing skill case alone does not show that the skill helped. The configured agent may already behave that way.

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

## Interpret Zero Lift

Zero lift is not automatically a failed skill. It means the configured agent already passed the case without it. Decide whether the skill still provides value through consistency, portability, or explicit policy.

## Dry Runs

```bash
skillet eval --dry
```

A dry run does not spawn an agent. It runs deterministic checks against the untouched fixture and setup workspace. Any passing check is potentially vacuous.

Dry runs cannot assess judge checks and do not replace baseline measurement.

## Errors and Failures

- **Fail:** the agent completed, but one or more checks did not pass.
- **Error:** setup, process execution, timeout, or judge protocol failed.

Keep those outcomes separate. A harness authentication failure says nothing about skill quality.
