# Skillet

Spec-driven authoring of agent skills. Define a structured `spec.yaml`
that captures intent, behaviors, and triggers; a small set of bundled
authoring agents render `SKILL.md` and eval cases from it, validate the
output, and iterate against eval failures.

## Install

```bash
npx @sentry/skillet install
```

This copies the skillet skill into your agent (auto-detects Claude Code,
OpenCode, Pi). Your agent then knows how to use skillet when you ask it
to create or improve skills.

## Usage

### Create a new skill from a description

```bash
npx @sentry/skillet create "Django N+1 query reviewer"
```

Generates `spec.yaml` from the description (interactive
spec-author dialogue), then runs the orchestrator: skill-writer
and eval-writer in parallel, then skill-validator and
evals-validator. Validator errors trigger one writer re-pass.

### Improve an existing skill

```bash
npx @sentry/skillet improve ./my-skill
```

If `my-skill/` already has a `spec.yaml`, the loop iterates from
there. If it only has a legacy `SKILL.md` (no spec), the loop
auto-imports first — no separate migration step.

### Add a behavior

```bash
npx @sentry/skillet add-eval ./my-skill \
  "should flag N+1 queries in loops" \
  "should NOT flag single .get() calls"
```

Each behavior is appended to `spec.yaml` and SKILL.md + eval files
are regenerated. Internally a thin wrapper over `spec refine`.

### Edit the spec via natural language

```bash
npx @sentry/skillet spec refine \
  "tighten the N+1 rule to also cover list comprehensions" \
  ./my-skill
```

The LLM produces structured `SpecPatch[]` operations, applies them
to `spec.yaml`, and regenerates the derived files.

### Inspect the spec

```bash
npx @sentry/skillet spec show ./my-skill
```

Pretty-prints the spec with the banner stripped.

### Verify a skill

```bash
npx @sentry/skillet verify ./my-skill
npx @sentry/skillet verify ./my-skill --semantic   # also runs LLM-judged SKILL.md coverage
npx @sentry/skillet verify ./my-skill --json       # structured output for CI
```

Four layers, short-circuits on the first failure:
1. Structural — each file (spec, SKILL.md, evals) parses and has its required fields
2. Cross-artifact coverage — every behavior has an eval case; no orphans
3. Per-behavior results — when run data is available, every behavior has a passing case
4. Semantic (opt-in) — LLM judge confirms SKILL.md actually encodes each behavior

Layers 1–3 are no-LLM and sub-second. Replaces the older `validate`
command with cross-artifact awareness on top.

### Run evals once

```bash
npx @sentry/skillet eval ./my-skill
npx @sentry/skillet eval ./my-skill --json
```

Delegates to vitest. Runs whatever `evals/*.eval.ts` exist; doesn't
regenerate — that happens automatically on spec mutations.

## Commands

| Command | Purpose |
|---------|---------|
| `create "<description>" [--input <dir>]...` | New skill: spec-author dialogue + orchestrator (writers + validators) |
| `improve [path]` | Re-render via orchestrator, run evals, re-pass against failures; auto-imports legacy |
| `spec init "<description>"` | Run interactive spec-author loop without the improve loop |
| `spec show [path]` | Pretty-print the spec (banner stripped) |
| `spec refine "<feedback>" [path]` | Natural-language patch; auto-regens |
| `spec import [path]` | Seed a spec from an existing SKILL.md, then run the spec-author loop |
| `resume <path> --answer "..."` | Resume a paused spec-author session (one `--answer` per pending question) |
| `add-eval [path] "<behavior>" ...` | Append behaviors to spec; auto-regens |
| `verify [path] [--semantic] [--json]` | Layered consistency check (subsumes `validate`) |
| `eval [path] [--json]` | Run evals once |
| `install [path]` | Install skillet skill into your agent |

## Credentials

Skillet auto-discovers LLM credentials. No configuration needed when
running inside Claude Code, Codex, GitHub Copilot, or any environment
with standard API keys set.

Override with `SKILLET_MODEL=provider/model-id` if needed.

## How spec-driven authoring works

`spec.yaml` captures **what** the skill does — intent, behaviors,
must-nots, triggers — as a simple, user-readable document. SKILL.md
is derived from it (clobbered on regen; edit the spec to change rules).
`evals/*.eval.ts` are generated initially but durable after that —
edit them directly to refine specific test prompts or assertions.

```
spec.yaml ──► generate ──► SKILL.md + evals/*.eval.ts
                              │
                              ▼
                       run evals (vitest)
                              │
                              ▼
                       verify (4 layers)
                              │
                              ▼
                       tune SKILL.md prose
                              │
                              └──► loop until pass or max iterations
```

A spec.yaml looks like this:

```yaml
managed_by: skillet
spec_version: 1
name: django-perf-review
intent: |
  Review Django code for performance regressions, focusing on N+1
  queries and queryset misuse.

triggers:
  should:
    - "review django performance"
    - "find N+1 queries"
    - "optimize django"
  should_not:
    - "review this React component"

behaviors:
  - id: flag-n-plus-one
    statement: Flag N+1 queries in loops over querysets.
    rationale: |
      Loops accessing related objects without select_related issue
      one query per iteration in production but pass tests.

must_not:
  - id: dont-flag-single-get
    statement: Don't flag single .get() calls as N+1.
    rationale: A single fetch isn't a query loop.
```

The spec is intent only — eval prompts, setup scripts, and assertions
live in the generated eval file (see below), not here. This keeps the
spec readable and lets you edit eval shapes directly without touching
the source of truth.

## Eval format

Eval files are TypeScript that vitest runs natively. They use the
harness-first API mirroring [vitest-evals#41](https://github.com/getsentry/vitest-evals/pull/41) —
imported through `@sentry/skillet/evals` so generated files don't
change when vitest-evals 0.9 ships.

```typescript
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  describeEval,
  CriterionJudge,
  SubstringJudge,
  skilletHarness,
} from "@sentry/skillet/evals";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval("django-perf-review", {
  data: [
    {
      name: "flag-n-plus-one__loop_over_books",
      tests_behavior: "flag-n-plus-one",
      input: "Review views.py for performance issues",
      expectedContains: "select_related",
      setup: `cat > views.py <<'EOF'
for book in Book.objects.all():
    print(book.author.name)
EOF`,
    },
    {
      name: "dont-flag-single-get__single_call",
      tests_behavior: "dont-flag-single-get",
      input: "Is `User.objects.get(id=1)` an N+1?",
      criteria: "agent does not call this an N+1 issue",
    },
  ],
  harness: skilletHarness({ skill: skillRoot }),
  judges: [SubstringJudge(), CriterionJudge()],
  threshold: 0.75,
});
```

Each case sets up a workspace (optional `setup`), sends `input` to an
agent loaded with the skill, and grades the output with the judges.
`tests_behavior` links cases back to spec entries — verification uses
this as the join key so failures land on the specific behavior they
affect, not on a free-text "something went wrong" signal.

## License

MIT
