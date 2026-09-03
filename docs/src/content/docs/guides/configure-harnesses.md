---
title: Configure Harnesses
description: Run eval cases through Codex, Claude Code, or another coding-agent CLI.
type: tutorial
summary: Select a built-in harness per run or define a custom command template in .skillet.yaml.
---

Harness configuration applies only after you opt into running eval cases. Ordinary spec and SKILL.md authoring does not start a harness or require harness configuration.

A harness installs the skill into a fresh workspace, runs the case prompt through an agent CLI, and captures the result for checks.

## Built-In Harnesses

Codex is the default:

```bash
skillet eval
skillet eval --harness codex
```

Skillet does not pin a model. Without a model suffix, Codex or Claude uses its
configured/default model. Built-in trials and judges use low effort by
default.

Use Claude Code explicitly:

```bash
skillet eval --harness claude
```

Add a model suffix when the CLI supports one:

```bash
skillet eval --harness claude:sonnet
skillet eval --harness codex:model-id
```

The selected binary must already be installed and authenticated.

## Configure the Default

Create `.skillet.yaml` at the skill root or an ancestor:

```yaml
harness: claude:sonnet
effort: low
concurrency: 4
```

CLI flags override the file.

- `effort` accepts `low`, `medium`, `high`, or `xhigh` for built-in harnesses.
- `concurrency` accepts `1` through `8` and limits parallel trials or variants within one case.
- Baseline is never enabled by configuration; pass `--baseline` when needed.
- Custom harnesses own their model and effort arguments.

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

## Runtime and Cost

Skillet keeps cases ordered and runs up to four trials or skill/baseline variants
within one case at once. Parallelism reduces wall-clock time but does not reduce
model usage.

Use `--concurrency 1` when agent CLIs or rate limits require serial execution.
Use `--effort low` for cheaper exploratory runs, then raise effort only when the
case needs deeper reasoning.
