# Test Plan — Skillet vs. skill-writer

## Goal

Settle, with measurable signal: does skillet produce skills as good as
or better than getsentry/skills' `skill-writer` on the deep, tricky
case? "Better" is decomposed below into three specific questions; at
least two need to come out positive for skillet to be worth using
over `skill-writer` directly.

## Test Corpus: getsentry/warden-skills

`warden-skills` ships five published security-review skills:
`wrdn-authz`, `wrdn-code-execution`, `wrdn-data-exfil`,
`wrdn-gha-workflows`, `wrdn-pii`. Each is the right shape for
comparison:

- 250–560-line `SKILL.md` (deep, not toy)
- explicit `SPEC.md` per skill (the published intent)
- `SOURCES.md` provenance (`wrdn-pii`)
- `references/` (per-framework or per-domain depth)
- **historical bug commits** named in `TESTING.md` and per-skill
  references (e.g. `wrdn-authz`: `cf341c9c950`, `681d46fef66`,
  `fb21d886a08`, `b9ea4f87297`). These are ground truth — the skill
  must re-detect the bug each commit fixed.

## Three test modes

### Mode A — Re-create-from-description (depth match)

For each warden skill, extract the published `SPEC.md`'s `## Intent` +
`## Scope` paragraph as the description. Hand that *same description*
to both tools.

- **Skillet path:**
  `skillet create "<intent+scope>" --path /tmp/skillet-out/<skill> \
     --input ~/src/sentry --input ~/src/getsentry`
- **skill-writer path:** invoke skill-writer in a Claude Code session
  with the same description as the user message; capture the produced
  skill directory.

Score on:
- **Behavior count** vs. published. Within ±20% counts as match.
- **Coverage of class-required dimensions** (skillet's
  `validateClassGates` for security-review:
  vulnerability-classes / exploit-paths / false-positive-controls /
  severity-calibration / remediations).
- **Reference topic coverage** (vulnerability-patterns,
  false-positive-traps, remediations).
- **Side-by-side LLM judge** rating "which more closely matches the
  published SPEC", blinded to source (see Bias Controls).

### Mode B — Greenfield (fresh skill, blind preference)

Five descriptions the corpus does NOT cover, e.g.:
- "Review GraphQL resolver code for authorization bugs."
- "Detect PII leaking into Datadog metrics tags."
- "Review Terraform plans for IAM privilege escalation."
- "Find SSRF in serverless function code."
- "Detect race conditions in payment-processing handlers."

For each, run both tools with identical inputs (`--input` paths into a
real codebase like `~/src/sentry`). Anonymize the output directories
(strip frontmatter `name`, rename to `skill-A`/`skill-B` randomly per
prompt). Have a human reviewer + an LLM judge each pick a winner per
skill, judging on: rule depth, framework awareness, false-positive
discipline, output-format clarity. Aggregate to a preference
percentage.

### Mode C — Regression on ground-truth bugs (the only test that
*actually matters*)

For each warden skill that has named ground-truth commits, run the
re-created skill against the **pre-fix** state via Warden:

```bash
git checkout <commit>~1 -- <touched-file>
warden --skill /tmp/<tool>-out/<skill> <touched-file>
```

Score the re-detection rate per tool. A skill is **valid** if it
detects at least N-1 of N ground-truth bugs (matches the published
skill's bar in `TESTING.md`).

For skillet specifically, also run `skillet eval /tmp/skillet-out/<skill>`
to confirm the skill-author-loop produced a passing eval suite — that's
a free correctness signal independent of warden runs.

| Skill | Ground-truth commits |
|-------|----------------------|
| `wrdn-authz` | `cf341c9c950`, `681d46fef66`, `fb21d886a08`, `b9ea4f87297` |
| (others) | scrape from `references/sentry.md` per skill |

## Decision rule

Skillet "wins" head-to-head when:
- **Mode C tie or better** (mandatory — can't ship a tool that detects
  fewer real bugs)
- **Mode A within ±20% behavior count and matching dimension coverage**
- **Mode B preference ≥ 50%** (parity is enough; skillet's value is
  reproducibility + iteration, not a single-shot prose victory)

Anything less, the agentic loop didn't earn its keep and we should
either tune the prompt, expand the tool set, or accept that
skill-writer + manual import is the better workflow.

## Reproducibility

- **Pinned models.** Set `SKILLET_MODEL`, `SKILLET_JUDGE_MODEL`, and
  the corresponding `ANTHROPIC_MODEL` (or whichever provider) for
  skill-writer to identical values. Record the exact model id with each
  run.
- **Pinned input dirs.** All `--input` paths checked out at a specific
  SHA before each run.
- **Three runs per cell.** LLMs are non-deterministic; report
  median + range.
- **Capture full session.** Save skillet's `.skillet-session.json` and
  skill-writer's transcript so reruns are auditable.

## Bias controls

- **Anonymize outputs** before judging. Strip authoring tool from
  frontmatter, rename directories `skill-A`/`skill-B` per case,
  randomize order so the same letter isn't always the same tool.
- **Use a different model as judge** than was used as author. If both
  tools were authored with Sonnet 4.6, judge with Opus 4.7.
- **Prompt the judge with the rubric**, not "which is better." Force
  per-criterion scoring; aggregate after.
- **No skillet maintainer judging Mode B** without blinding.

## Concrete next steps

1. Land a `evals/vs-skill-writer/` directory with one fixture per
   warden skill: `<skill>/description.txt`, `<skill>/published-spec.md`
   (copied from warden-skills), `<skill>/ground-truth.json` (commit list).
2. Write `scripts/run-comparison.ts` that drives both tools, captures
   outputs, and runs the Warden regression sweep. Output: a single
   JSON report per (tool, skill, run).
3. Write `scripts/score-comparison.ts` that consumes those reports and
   prints the decision-rule table.
4. Land an `npm run compare:vs-skill-writer` entry point that runs the
   above end-to-end. Expensive; not in CI by default.

## What this plan deliberately does NOT do

- It doesn't measure skillet's own iteration loop quality (the
  eval-pass-rate signal is already covered by `skillet eval`).
- It doesn't compare against hand-written skills, only against
  skill-writer.
- It doesn't try to settle "which tool is faster" — irrelevant if
  output quality and bug-detection rate aren't comparable first.
