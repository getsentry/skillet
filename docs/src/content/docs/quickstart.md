---
title: Quickstart
description: Install Skillet and create a skill through your coding agent.
type: tutorial
summary: Install the CLI, add the authoring skill, and start a skill from a plain-language request.
---

Skillet uses the coding-agent CLI you already run. The Skillet CLI manages files and validates contracts; your agent writes the specification and instructions. Optional evals are available when you choose to measure selected scenarios.

## Prerequisites

- Node.js 20.11 or newer
- Codex, Claude Code, or another agent CLI for eval runs

## Run the Current CLI

```bash
npx -y @sentry/skillet@latest init
```

With pnpm, use `pnpx @sentry/skillet@latest init`. The authoring skill uses the
same explicit `@latest` package command so its CLI-provided formats and guidance
do not drift behind a global installation.

`init` asks before installing the `skillet-authoring` skill through
[dotagents](https://dotagents.sentry.dev/) in user scope under `~/.agents`.

If you prefer a global binary, install it explicitly:

```bash
npm install -g @sentry/skillet
skillet init
```

Installed binaries check npm at most once per hour and recommend the current
package command when an update is available.

## Install the Authoring Skill Another Way

### Install With dotagents

Install the authoring skill in user scope directly:

```bash
npx -y @sentry/dotagents@latest --user add getsentry/skillet skillet-authoring
```

The `add` command records the dependency in `~/.agents/agents.toml` and installs it immediately for supported agents. No separate install command is required.

Run `install` later to refresh declared skills:

```bash
npx -y @sentry/dotagents@latest --user install
```

The Skillet CLI can recommend a newer package, but it does not rewrite installed agent skills. Run this refresh command after upgrading Skillet so the authoring workflow matches the current CLI.

### Ask Your Agent to Install It

Or tell your agent:

> Install the [`skillet-authoring` skill](https://github.com/getsentry/skillet/tree/main/skills/skillet-authoring) for me.

## Ask for a Skill

In your coding agent, ask:

> Create a skill that enforces our commit conventions.

The authoring skill will:

1. Create the skill directory.
2. Clarify ambiguous behavior.
3. Write and validate `spec.md`.
4. Render `SKILL.md`.
5. Validate the completed skill.

The authoring skill does not create or run evals unless you explicitly request them.

## Check the Result

From the new skill directory:

```bash
npx -y @sentry/skillet@latest status
npx -y @sentry/skillet@latest validate
```

`status` reports the next core step, and `validate` checks the complete contract.

If you later ask your agent to add or run evals, authenticated agent CLI sessions can take time and consume model usage. Read [Write Honest Evals](/guides/write-honest-evals/) before choosing cases and [Understand Eval Results](/concepts/evaluations-and-lift/) before interpreting trials, baselines, or lift.

## Next

1. Follow [Create Your First Skill](/first-skill/) for the complete artifact flow.
2. Read [Specifications](/concepts/specifications/) before changing skill behavior.
3. Read [Write Agent Instructions](/guides/write-agent-instructions/) before editing the runtime skill.
4. If evaluation would add value, continue with [Write Honest Evals](/guides/write-honest-evals/).
