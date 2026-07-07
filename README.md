# Skillet

Spec-driven agent skills with mechanical evals.

Skillet is a small CLI that manages three artifacts per skill and proves the skill works:

- **`spec.md`** — the source of truth: intent, triggers, behaviors with WHEN/THEN scenarios, and constraints, in a strict-but-tiny markdown grammar humans review in PRs.
- **`SKILL.md`** — the instruction text agents load, rendered from the spec by *your* coding agent.
- **`evals/cases/*.yaml`** — declarative eval cases that run the skill through a **real coding agent** (codex or claude CLI, or any CLI you configure) in a fresh workspace and check what it actually did.

Skillet itself makes **zero LLM calls**. It scaffolds, validates, serves writing instructions to your agent, and runs evals mechanically. All generation happens in the coding agent you already use, driven by generated `/skillet:*` workflows — so upgrading skillet upgrades every agent's behavior, and nothing here needs an API key.

## Install

```bash
npm install -g @sentry/skillet   # or: npx @sentry/skillet
skillet init --tools claude      # writes /skillet:* workflows (+ codex for $CODEX_HOME/prompts)
```

## Quickstart

```bash
skillet new commit-conventions   # scaffold spec.md + evals/ layout
# fill in spec.md by hand, or ask your agent: /skillet:propose
# then have the agent render SKILL.md + eval cases: /skillet:render
skillet validate                 # grammar, frontmatter, case schema, coverage — no LLM
skillet eval --trials 3 --baseline
```

The last command is the point of the tool: every case runs through a real agent *with* the skill installed and (with `--baseline`) *without* it, and skillet reports per-behavior pass rates and **lift** — the difference the skill actually makes.

```
Behaviors:
  conventional-subject: 100% (3/3) | baseline 33% | lift +67%
  branch-safety:        100% (3/3) | baseline 0%  | lift +100%
```

## The spec

```markdown
# Commit Conventions

## Intent

Make the agent produce disciplined git commits...

## Triggers

- **SHOULD** trigger when the user asks to commit changes
- **SHOULD NOT** trigger when the user asks to review a diff

## Behaviors

### Behavior: Conventional subject

The agent SHALL write commit subjects as `<type>(<scope>): <description>`...

#### Scenario: Committing a staged bug fix

- **WHEN** the workspace has a staged bug fix and the user asks to commit
- **THEN** the commit subject starts with `fix` and stays under 70 characters

## Constraints

### Constraint: No history rewriting

The agent MUST NOT amend, rebase, or force-push unless explicitly asked.
```

Rules the validator enforces: every behavior has at least one scenario (`####`, exactly four hashes), behavior names slugify to unique ids (`conventional-subject`), and every scenario has WHEN/THEN bullets. Errors come with line numbers and fix hints.

## Evals

One YAML file per case in `evals/cases/`, linked to a spec behavior by id:

```yaml
behavior: conventional-subject
prompt: |
  I fixed the null check in app.js — please commit my staged change.
setup: |
  git init -q -b main && git add -A ...
checks:
  - shell: git log -1 --format=%s | grep -Eq '^(feat|fix|chore)...'
  - file_exists: some/artifact
  - judge: The commit message accurately describes the null-check fix.
trials: 1
timeout: 300
```

- Each trial gets a **fresh temp workspace**: the optional `fixture:` directory (`evals/fixtures/<slug>/`) is copied in, then `setup:` runs (the script itself never enters the workspace).
- `file_exists` and `shell` checks run in the workspace after the agent finishes — check artifacts, not phrasing. Transcript regexing is deliberately unsupported.
- `judge:` checks are graded by the same harness CLI with a strict pass/fail verdict protocol, and only run after all deterministic checks pass. No API keys, no thresholds; repeatability comes from `--trials`.
- A behavior with no case is a validation warning; a case referencing an unknown behavior or missing fixture is an error.

## Harnesses

The default harness is `codex` (`codex exec`); `claude` (`claude -p`) is built in. Pick per run with `--harness`, or configure any CLI in `.skillet.yaml`:

```yaml
harness:
  name: my-agent
  command: "my-agent run --dir {workspace} {prompt}"
  skill_dir: "{workspace}/.my-agent/skills"   # where the skill gets installed
```

Skill installation uses each agent's native mechanism: `.claude/skills/` for claude, the workspace `AGENTS.md` for codex (which has no skill mechanism), `skill_dir` for custom harnesses. `--baseline` runs the same trials with no installation at all.

## Commands

| Command | What it does |
|---|---|
| `skillet init [--tools claude,codex] [--force]` | Scaffold `.skillet.yaml` + agent workflow files |
| `skillet new <name>` | Scaffold a skill directory with a templated spec.md |
| `skillet status [path]` | Artifact state and the single next step, derived from disk |
| `skillet instructions <spec\|skill\|evals>` | Template + writing rules for one artifact (what the workflows consume) |
| `skillet validate [path]` | Spec grammar, SKILL.md frontmatter, case schema, coverage — exit 1 on errors |
| `skillet eval [path] [--case id] [--trials n] [--baseline] [--harness x] [--keep-workspaces]` | Run cases through the harness; per-behavior pass rates and lift |
| `skillet show [path]` | Pretty-print the parsed spec with coverage |

Every command takes `--json`: one JSON object on stdout, prose on stderr, exit 0/1.

## Agent workflows

`skillet init` generates four thin workflows that script your agent into the `skillet status` / `skillet instructions --json` loop:

- **`/skillet:propose`** — interview the user, write spec.md
- **`/skillet:render`** — render SKILL.md + eval cases from the spec
- **`/skillet:improve`** — diagnose failing evals into spec/skill/eval fixes and re-run
- **`/skillet:migrate`** — convert a legacy `spec.yaml` or bare SKILL.md skill

## Migrating from skillet v0

The v0 formats (`spec.yaml`, generated `evals/*.eval.ts`, the `create`/`improve`/`spec` commands, and all `SKILLET_*` env vars) are gone. `skillet status` detects legacy skills and points at `/skillet:migrate`, which converts intent to `spec.md` and eval intent to YAML cases. See `examples/commit-conventions/` for a complete current-format skill.
