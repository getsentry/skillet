# Harder suite: migration safety (2026-07-09)

Follow-up to the changelog-discipline experiment, which tied at 15/15 (ceiling). This suite was designed to discriminate: a **goal-level task description** (mechanics not spelled out), a **judgment behavior** (applied migrations are immutable, but *unapplied* ones are editable — an exception that punishes over-broad rules), a **tempting prompt** (the user explicitly proposes editing an applied migration as a shortcut), and multi-file consistency requirements (paired `.down.sql`, DDL/DML separation). Same protocol: evals written before either skill existed, shared verbatim, only SKILL.md swapped, codex harness, 3 trials/case.

## Results

| behavior | no-skill | naive | skillet |
|---|---|---|---|
| never-edit-applied-migrations (tempting) | **0/3** | 3/3 | 3/3 |
| backfills-separate-from-schema | **0/3** | 3/3 | 3/3 |
| destructive-changes-are-reversible | 3/3 | 3/3 | 3/3 |
| new-changes-get-new-migrations | 3/3 | 2/3 | **1/3** |
| unapplied-migrations-may-be-edited (judgment) | 3/3 | 3/3 | 3/3 |
| stay-quiet-read-only | 3/3 | 3/3 | 3/3 |
| **TOTAL** | **12/18** | **17/18** | **16/18** |

## Findings

1. **No ceiling this time — the suite discriminates.** Unskilled codex complies with the tempting shortcut every single time (editing an applied migration 3/3) and always mixes backfills into schema changes. Both skills fix both, cleanly. That's the skill value proposition, isolated: +5 to +6 behaviors' worth of lift concentrated exactly where the defaults are wrong.
2. **Naive ≈ skillet again (17 vs 16, well within noise at n=18).** The skeptical prior holds: a frontier-model one-shot skill matches the spec-driven one even on a harder task.
3. **The skillet skill's dropped trials are a real, diagnosable wording defect** — and the most instructive artifact of the run. Its "unapplied migrations are editable work-in-progress" rule (written to pass the judgment case) bled into the plain add-a-column case: the agent folded the *new* change into unapplied `0003` instead of creating `0004`, twice. The exception swallowed the rule. The naive skill, which stated the exception less forcefully, hit the same trap once. Per-behavior eval output localized the defect to the exact sentence — this is `/skillet:improve`'s intended input, and nothing in a vibes-based workflow would have surfaced it.
4. **Eval authoring is as error-prone as skill authoring.** Mid-run, the destructive-case check turned out to be too rigid: it hard-coded the drop landing in `0004_`, and the naive-skilled agent did something *better* — archived the column's data in `0004`, dropped in `0005` — and got scored 0/3 for it. One earlier check asserted repo-wide git cleanliness, which skill installation itself breaks. Both were fixed and re-run, but the lesson generalizes: deterministic checks encode assumptions, and wrong assumptions silently punish good behavior. Tooling that stress-tests checks (run them against a few plausible good outcomes before spending agent runs) would be a high-value skillet feature.
5. Unskilled codex has strong migration instincts where convention is visible in the fixture (paired down files: 3/3; editing the unapplied file when asked: 3/3). Skills add value precisely on the rules that *aren't* inferable from the repo — the social/policy rules (never edit applied history, even when asked nicely).

## Running verdict across both experiments

- Skill content, delivered reliably (codex AGENTS.md injection): **large, reproducible lift** — 3/15→15/15 (changelog), 12/18→16-17/18 (migrations), concentrated on anti-default behaviors.
- Skillet's authoring loop vs one-shot: **no measurable advantage in either experiment** (tie, then 16 vs 17). The spec discipline did not produce a better skill; in fact its sharper exception wording introduced this run's only real skill defect.
- Skillet's measurement loop: **earned its keep both times** — it found the claude `-p` duty-skill dead zone, a skill-wording defect localized to a sentence, two eval-authoring traps, and honest nulls. The product thesis that survives: *skillet is how you find out your skill is wrong; not (yet) how you write a better one.*
