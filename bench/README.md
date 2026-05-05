# Bench

Cleanroom benchmark harness for skillet's bundled-agent
pipeline. Use it to:

1. Capture a baseline of how the pipeline performs across a
   diverse set of skills.
2. Iterate on agent prompts (`agents/<name>/SKILL.md`,
   references, seed prompts).
3. Re-run the bench with a label, then diff against baseline
   to see what improved or regressed.

The bench runs are gitignored (`.skillet-bench/` in
`.gitignore`) — they're large and reproducible. Save labelled
runs locally; share the report markdown if you need to.

## Run

```bash
# default: timestamp label (e.g. "2026-05-05T18-30-00-000Z")
npx tsx bench/run.ts

# named label — useful for before/after comparisons
npx tsx bench/run.ts --label before-name-fix

# single skill
npx tsx bench/run.ts --label commit-only --only commit
```

Output lands in `.skillet-bench/<label>/`:

```
.skillet-bench/<label>/
├── _meta.json            # run metadata: timestamp, model, skill list
├── _summary.md           # at-a-glance summary table
└── <skill-id>/
    ├── SKILL.md          # cleanroom output
    ├── spec.yaml
    ├── evals/...
    ├── SOURCES.md        # only if spec-author wrote one
    └── _stats.json       # per-skill metrics for the report tool
```

Skills run **sequentially** in one process. The internal AI
queue throttles parallelism within each clean-room (writers +
validators run in parallel via Promise.all). Running the
whole bench in 6 separate processes stampedes the rate limit
— don't.

Wall-clock per skill is roughly 2-4 minutes. Whole bench is
~15-25 minutes for the default 6 skills.

## Compare

```bash
npx tsx bench/report.ts <baseline-label> <candidate-label> [--out <path>]
```

Examples:

```bash
# print to stdout
npx tsx bench/report.ts before-name-fix after-name-fix

# write to a file you can paste into a PR description
npx tsx bench/report.ts before after --out /tmp/agent-iter-comparison.md
```

The report surfaces, per skill:

- whether the run succeeded
- whether `spec.name` was preserved (rename regression check)
- behaviors / must_nots / references count deltas
- SKILL.md line count delta (lower-is-better)
- eval files / judges / fixtures deltas
- validator findings (errors + total)
- eval coverage ratio
- wall-clock delta

Plus a headline summary aggregating across all skills.

## Manifest

`bench/manifest.json` lists the skills to run. Each entry:

```json
{
  "id": "commit",
  "source": "getsentry/skills/skills/commit",
  "description": "<verbatim from source skill's frontmatter>"
}
```

To add a skill: copy its frontmatter `description` into a new
manifest entry. Keep `id` matching the source directory name
so the rename-detection check works.

The current 6 skills cover:

- 4 workflow-process: `commit`, `create-branch`, `pr-writer`,
  `iterate-pr`
- 2 generic: `blog-writing-guide`, `prompt-optimizer`

To extend with `--input` paths (so spec-author can ground
behaviors in real source), add an `inputs[]` array on the
manifest entry. The runner currently ignores it (cleanroom is
description-only by design); future work hooks `inputs` into
spec-author for the SOURCES.md path.

## Gotchas

- The runner uses `seedFromDescription` directly and skips the
  interactive spec-author dialogue. That keeps benches
  reproducible and non-blocking, but means SOURCES.md never
  generates here. To bench the full path including
  spec-author dialogue, run `skillet create` interactively.
- Validator timeouts under heavy load: if multiple bench runs
  share the API key concurrently, expect 240s per-LLM-call
  timeouts. Run one bench at a time.
- Large skills (>30 spec entries) hit the eval-writer
  single-pass cap. The eval-writer prompt now batches via
  re-passes (Pass 1: judges; Pass 2+: 8-10 evals each), but
  the orchestrator's per-pair re-pass cap is 1, so suites
  that need >2 passes will leave eval files missing. Re-run
  `skillet improve` on the produced output to converge.
