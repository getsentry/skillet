# Skillet

Spec-driven agent skills, proven by evals.

A skill is instruction text your coding agent loads (`SKILL.md`). Skillet makes skills trustworthy by deriving them from a reviewable contract and testing them against a real agent:

- **`spec.md`** — the source of truth: intent, triggers, behaviors with WHEN/THEN scenarios, constraints. A tiny markdown grammar humans review in PRs.
- **`SKILL.md`** — the instruction text, rendered from the spec by *your* agent.
- **`evals/cases/*.yaml`** — declarative cases that run the skill through a real coding-agent CLI (codex, claude, or any CLI) in a fresh workspace and check what it actually did.

Skillet itself makes **zero LLM calls** and needs **no API keys** — agent CLIs carry their own auth, and all writing happens in the agent you already use.

## Getting started

```bash
npm install -g @sentry/skillet   # or use npx @sentry/skillet everywhere
skillet init
```

`skillet init` installs the **skillet-authoring** skill for all your agents via [@sentry/dotagents](https://github.com/getsentry/dotagents) (user scope, asks first). From then on, skill work is conversational — ask your agent:

> "Create a skill that enforces our commit conventions."

The authoring skill drives the whole loop: it scaffolds with `skillet new`, interviews you for the spec, renders SKILL.md, writes eval cases, and iterates until `skillet validate` and `skillet eval` are green. You review the spec diff; the evals prove the rest.

Prefer to manage installation yourself? `npx @sentry/dotagents add getsentry/skillet skillet-authoring && npx @sentry/dotagents install` (project scope; `--user` for global), or copy [`skills/skillet-authoring/`](skills/skillet-authoring/) anywhere your agents look.

## The point: measured lift

```bash
skillet eval --trials 3 --baseline
```

Every case runs through a real agent *with* the skill installed and *without* it:

```
Behaviors:
  conventional-subject: 100% (3/3) | baseline 33% | lift +67%
  branch-safety:        100% (3/3) | baseline 0%  | lift +100%
```

**Lift** is the difference the skill actually makes. Zero lift is a finding too — your agent already behaved that way. (Harness CLIs load your global agent config, so baseline measures *your configured agent*, not a bare model.)

Evals run through an embedded [vitest-evals](https://github.com/getsentry/vitest-evals) engine — no config or dependencies in your skill directory. `--report results.json` writes an artifact for `npx vitest-evals serve` (local report UI) or the `getsentry/vitest-evals` GitHub Action (CI summaries).

## What the artifacts look like

A behavior in `spec.md`:

```markdown
### Behavior: Conventional subject

The agent SHALL write commit subjects as `<type>(<scope>): <description>`.

#### Scenario: Committing a staged bug fix

- **WHEN** the workspace has a staged bug fix and the user asks to commit
- **THEN** the commit subject starts with `fix` and stays under 70 characters
```

Its eval case in `evals/cases/conventional-subject.yaml`:

```yaml
behavior: conventional-subject
prompt: |
  I fixed the null check in app.js — please commit my staged change.
setup: |
  git init -q -b main && git add -A ...
checks:
  - shell: git log -1 --format=%s | grep -Eq '^(feat|fix|chore)'
  - judge: The commit message accurately describes the null-check fix.
```

Checks grade the **workspace**, never the transcript: `file_exists` and `shell` (exit 0 = pass) run after the agent finishes; `judge:` criteria are graded by the same harness CLI with a strict pass/fail protocol, only after deterministic checks pass. `skillet eval --dry` flags cases a do-nothing agent would pass. See [`examples/commit-conventions/`](examples/commit-conventions/) for a complete skill.

## Commands

| Command | What it does |
|---|---|
| `skillet init [--no-prompt]` | Install the authoring skill for your agents (asks first) |
| `skillet new <name>` | Scaffold a skill directory with a templated spec.md |
| `skillet status [path]` | Artifact state + the single next step, from disk |
| `skillet instructions <spec\|skill\|evals>` | Template and writing rules for one artifact |
| `skillet validate [path]` | Grammar, frontmatter, case schema, coverage — no LLM |
| `skillet eval [path]` | Run cases through the harness; pass rates and lift |
| `skillet show [path]` | Pretty-print the parsed spec with coverage |

Every command takes `--json` (one object on stdout, prose on stderr, exit 0/1) — that machine interface is how the authoring skill drives the tool. Run `skillet <command> --help` for flags; `eval` supports `--case`, `--behavior`, `--trials`, `--baseline`, `--harness codex|claude|custom[:model]`, `--sandbox docker`, `--dry`, `--out <dir>` (resumable runs), `--report <file>`, `--verbose`, `--keep-workspaces`.

## Harnesses and sandboxing

Default harness is `codex`; `claude` is built in; any CLI works via `.skillet.yaml` (`command: "my-agent run --dir {workspace} {prompt}"`). Add a model suffix to either builtin (`--harness claude:sonnet`).

By default agents run directly on your machine with full access — fine for skills you wrote. For untrusted skills or CI, `skillet eval --sandbox docker` wraps every harness invocation (judges included) in a container. Details, config, and the macOS keychain caveat: [LIFECYCLE.md](LIFECYCLE.md).

## Migrating from skillet v0

The v0 formats (`spec.yaml`, generated `evals/*.eval.ts`, the `create`/`improve`/`spec` commands) are gone. `skillet status` detects legacy skills and directs the migration.
