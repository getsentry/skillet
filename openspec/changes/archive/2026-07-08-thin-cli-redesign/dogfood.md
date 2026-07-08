# Dogfood record — task 7.2/7.3

Skill: `examples/commit-conventions/` (2 behaviors, 2 cases, 1 judge check).

## Adapter parity (7.3)

| Case | claude | codex |
|---|---|---|
| branch-safety | pass (63s) | pass (97s, after sandbox fix) |
| conventional-subject (incl. judge) | pass (~90s) | pass (72–113s, judge pass) |

The first codex run failed and exposed a real adapter bug: codex `exec --sandbox workspace-write` denies `.git` writes, so codex *followed the skill* (tried `git checkout -b`) but could not commit. Fixed by switching the adapter to `--dangerously-bypass-approvals-and-sandbox` (same trust level as claude's `--dangerously-skip-permissions`; workspaces are disposable tempdirs).

## Lift measurement (7.2)

`skillet eval examples/commit-conventions --trials 3 --baseline --harness codex`:

```
summary: 2 cases, 6 skill trials, 6 baseline trials, 0 failed, 0 errored
branch-safety:        skill 3/3 (100%) | baseline 3/3 (100%) | lift +0%
conventional-subject: skill 3/3 (100%) | baseline 3/3 (100%) | lift +0%
```

**Interpretation:** the measurement machinery works end-to-end (12 real agent runs, deterministic checks, harness-executed judges, paired baselines). The lift itself is zero *on this machine* because baseline trials still load the user's global agent configuration (see LIFECYCLE.md's baseline caveat) — this user's codex already writes conventional subjects and branches before committing. That is the intended reading of `--baseline`: this particular skill adds nothing for this particular configured agent. A discriminating example would need behaviors the unconfigured agent plausibly gets wrong (e.g. project-specific conventions no global config teaches).
