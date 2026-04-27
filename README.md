# Skillet

Spec-driven authoring of agent skills. Define a structured `spec.yaml`
that captures intent, behaviors, and triggers; skillet generates
`SKILL.md` and eval cases from it, runs them, and iterates by patching
the spec until coverage and per-behavior results pass.

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

Generates `spec.yaml` from the description, derives `SKILL.md` and
eval cases, runs the verify-driven iteration loop until per-behavior
checks pass.

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

Each behavior is appended to `spec.yaml` and SKILL.md + eval YAMLs
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

Runs whatever `evals/*.eval.yaml` exist. Doesn't regenerate — that
happens automatically on spec mutations.

## Commands

| Command | Purpose |
|---------|---------|
| `create "<description>"` | New skill: spec init + regen + improve loop |
| `improve [path]` | Iterate until per-behavior evals pass; auto-imports legacy |
| `spec init "<description>"` | Generate spec without entering the improve loop |
| `spec show [path]` | Pretty-print the spec (banner stripped) |
| `spec refine "<feedback>" [path]` | Natural-language patch; auto-regens |
| `spec import [path]` | Reverse-engineer spec from existing SKILL.md |
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

`spec.yaml` is the source of truth. SKILL.md and eval YAMLs are
derived from it. Spec mutations flow through CLI subcommands —
hand edits get clobbered on the next regen, and the file carries a
banner saying so.

```
spec.yaml ──► generate ──► SKILL.md + evals/*.eval.yaml
                              │
                              ▼
                            run evals
                              │
                              ▼
                       verify (4 layers)
                              │
                              ▼
                       assess → SpecPatch[]
                              │
                              ▼
                       apply to spec.yaml ──► regenerate
                              │
                              └──► loop until pass or max iterations
```

A spec.yaml looks like this:

```yaml
managed_by: skillet
spec_version: 1
name: django-perf-review
class: workflow-process
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
    eval:
      setup: |
        cat > views.py <<'EOF'
        for book in Book.objects.all():
            print(book.author.name)
        EOF
      prompt: "Review views.py for performance issues"
      expect: "select_related"

must_not:
  - id: dont-flag-single-get
    statement: Don't flag single .get() calls as N+1.
    rationale: A single fetch isn't a query loop.
    eval:
      prompt: "Is `User.objects.get(id=1)` an N+1?"
      criteria: "agent does not call this an N+1 issue"
```

Every behavior produces one eval case named `<id>__<slug>` and tagged
`tests_behavior: <id>`. Verification uses these as join keys to map
case results back to spec entries — failures land on the specific
behavior they affect, not on a free-text "something went wrong" signal.

## Eval format

Eval cases live in `evals/*.eval.yaml`. When generated by skillet they
include the `tests_behavior` field linking back to the spec; legacy
hand-written cases work via the `<id>__<slug>` name convention.

```yaml
evals:
  - name: flag-n-plus-one__loop_over_books
    tests_behavior: flag-n-plus-one
    workspace:
      setup: |
        cat > views.py <<'EOF'
        for book in Book.objects.all():
            print(book.author.name)
        EOF
    turns:
      - "Review views.py for query performance issues"
    checks:
      - output_contains: "select_related"
```

Cases set up a workspace, send prompts to an agent loaded with the
skill, and check the output with structural assertions or an LLM judge.

## License

MIT
