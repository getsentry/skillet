# Does skillet-authored beat one-shot? (2026-07-08)

**Question:** does a skill authored through skillet's spec-driven process outperform a skill produced by simply asking a frontier model to "write a SKILL.md that does X"?

**Method.** One fixed task description (`task.md`, changelog discipline — a duty no default agent performs unprompted) was the sole input to both arms. *Naive*: a fresh `claude -p` wrote SKILL.md in one shot (`SKILL.naive.md`). *Skillet*: the spec-driven flow — `spec.md` via `skillet instructions spec`, render via `skillet instructions skill` (`SKILL.skillet.md`). The eval suite (5 behaviors, deterministic checks only) was written from the task description before either skill existed and shared verbatim between arms; only the SKILL.md file swapped. 3 trials per case per arm plus a paired no-skill baseline. Agents under test: codex (default model) and claude:sonnet — no expensive models.

## Results

Codex harness (skill body injected via workspace AGENTS.md — content always in context):

| behavior | no-skill | naive | skillet |
|---|---|---|---|
| create-changelog-when-missing | 0/3 | 3/3 | 3/3 |
| entry-format | 0/3 | 3/3 | 3/3 |
| preserve-released-sections | 0/3 | 3/3 | 3/3 |
| record-every-code-change | 0/3 | 3/3 | 3/3 |
| stay-quiet-on-read-only-tasks | 3/3 | 3/3 | 3/3 |
| **TOTAL** | **3/15** | **15/15** | **15/15** |

Claude `-p` harness (skill installed under `.claude/skills/`, sonnet): **all three arms identical (3/15)**. A probe confirmed the skill was installed and discoverable — sonnet could quote its description — but the Skill mechanism never fired during any code-change task.

(Three codex trials initially failed with "timed out waiting for cloud config bundle" — codex never started; retried clean. Skillet counted those startup failures as `fail` rather than `error`, a runner bug worth fixing.)

## Findings

1. **Skill content works: +80% lift.** Both skills took codex from 3/15 to 15/15. When the mechanism guarantees the text is in context, a decent SKILL.md fully transmits the discipline.
2. **Skillet's authoring process showed no measurable advantage over one-shot** on this task: a dead tie at ceiling. When the task description already states the rules precisely, a frontier model one-shots an equally effective skill. Caveats: n=15 per arm, and both arms hit 100% — a ceiling effect; a vaguer description or harder behaviors might separate them. But the honest headline stands: **the authoring loop is not where skillet demonstrated value.**
3. **Where skillet did demonstrate value is the measurement itself.** This experiment — paired baselines, arm swapping, deterministic workspace checks, per-behavior tables — is exactly what `skillet eval --baseline` does, and none of the findings (including the tie) are knowable without it.
4. **The claude `-p` result is the actionable discovery: duty-type skills silently don't work through the Skill mechanism in print mode.** The description is visible to the model, the skill is loadable, and it still never triggers for "whenever you do X, also do Y" obligations — the model matches skills against the *task*, not against standing duties. Every duty-style skill installed for claude non-interactive runs is plausibly inert. This deserves its own follow-up (and possibly a CLAUDE.md-injection install mode for the claude harness, mirroring codex's AGENTS.md).

## Verdict

Claim "skillet produces better skills than one-shot generation": **not supported** by this experiment (tie at ceiling). Claim "skillet tells you the truth about whether a skill works": **strongly supported** — it produced a real lift number, exposed a dead delivery mechanism on claude, caught its own runner bug, and made an honest null result cheap to obtain. The product's proven value today is the eval harness; the authoring loop's value remains unproven.
