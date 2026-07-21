---
title: Quickstart
description: Install Skillet and create a skill through your coding agent.
type: tutorial
summary: Install the CLI, add the authoring skill, and start a skill from a plain-language request.
---

Skillet uses the coding-agent CLI you already run. The Skillet CLI manages files, validates contracts, and runs evals; your agent writes the specification, instructions, and cases.

## Prerequisites

- Node.js 20.11 or newer
- Codex, Claude Code, or another agent CLI for eval runs

## Install the CLI

```bash
npm install -g @sentry/skillet
```

You can use `npx @sentry/skillet` instead of a global installation.

## Install the Authoring Skill

### Recommended: Skillet Setup

```bash
skillet init
```

`skillet init` asks before installing the `skillet-authoring` skill through [dotagents](https://dotagents.sentry.dev/) in user scope under `~/.agents`.

### Install With dotagents

Install the authoring skill in user scope directly:

```bash
npx -y @sentry/dotagents --user add getsentry/skillet skillet-authoring
```

The `add` command records the dependency in `~/.agents/agents.toml` and installs it immediately for supported agents. No separate install command is required.

Run `install` later to refresh declared skills:

```bash
npx -y @sentry/dotagents --user install
```

### Install the Skill Directly

If your agent reads skills from another location, copy the [`skills/skillet-authoring`](https://github.com/getsentry/skillet/tree/main/skills/skillet-authoring) directory into that agent's skill directory.

## Ask for a Skill

In your coding agent, ask:

> Create a skill that enforces our commit conventions.

The authoring skill will:

1. Create the skill directory.
2. Clarify ambiguous behavior.
3. Write and validate `spec.md`.
4. Render `SKILL.md`.
5. Add eval cases.
6. Run validation and evals.

## Check the Result

From the new skill directory:

```bash
skillet status
skillet validate
skillet eval --dry
skillet eval --trials 3 --baseline
```

`status` reports the next artifact, `validate` checks the complete contract, `eval --dry` finds vacuous cases, and `--baseline` measures the difference the skill makes.

## Next

- Follow [Create Your First Skill](/first-skill/) for the manual artifact flow.
- Read [Evaluations and Lift](/concepts/evaluations-and-lift/) before interpreting results.
