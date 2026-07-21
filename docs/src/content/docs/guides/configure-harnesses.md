---
title: Configure Harnesses
description: Run eval cases through Codex, Claude Code, or another coding-agent CLI.
type: tutorial
summary: Select a built-in harness per run or define a custom command template in .skillet.yaml.
---

A harness installs the skill into a fresh workspace, runs the case prompt through an agent CLI, and captures the result for checks.

## Built-In Harnesses

Codex is the default:

```bash
skillet eval
skillet eval --harness codex
```

Use Claude Code explicitly:

```bash
skillet eval --harness claude
```

Add a model suffix when the CLI supports one:

```bash
skillet eval --harness claude:sonnet
skillet eval --harness codex:gpt-5
```

The selected binary must already be installed and authenticated.

## Configure the Default

Create `.skillet.yaml` at the skill root or an ancestor:

```yaml
harness: claude:sonnet
```

CLI flags override the file.

## Custom Harness

Use a command template for another CLI:

```yaml
harness:
  name: my-agent
  command: "my-agent run --dir {workspace} {prompt}"
  skill_dir: "{workspace}/.my-agent/skills"
```

The command must include both placeholders:

- `{workspace}` is the fresh trial directory.
- `{prompt}` is the eval case prompt.

`skill_dir` is optional. When present, Skillet installs the skill there before running the command.

Skillet shell-quotes the `{workspace}` and `{prompt}` values, substitutes them into the template, and executes the result through `sh -c`. Shell operators such as pipes and redirects are available in the static template text.

## Skill Installation by Harness

- Claude Code receives the skill under `.claude/skills/`.
- Codex receives instructions through a workspace `AGENTS.md` and a staged skill directory.
- Custom harnesses use `skill_dir` when configured.
- Baseline trials skip skill installation.

## Global Configuration Still Applies

Harness CLIs load their normal user configuration. Baseline therefore means “your configured agent without this skill,” not a bare model.
