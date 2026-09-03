---
title: Skillet
description: Build agent skills from a reviewable specification, with optional evals for selected behavior.
url: /
---

# Skillet

Skillet helps you build skills without guessing:

Ask your coding agent to create or improve a skill. The authoring skill uses the Skillet CLI to draft and validate the spec and runtime instructions.

The authoring skill runs Skillet through `npx -y @sentry/skillet@latest` (or the pnpm equivalent) so it receives the current file formats and writing guidance.

1. Define the contract in `spec.md`.
2. Render the contract into agent instructions.
3. Validate the skill.
4. Optionally run selected scenarios through a coding-agent CLI when measurement is useful.

The authoring skill does not create or run evals unless you explicitly ask. When chosen, evals give repeatable evidence for selected scenarios; they do not grade a skill's universal quality.

## Set Up Skillet

Paste this into your coding agent:

```text
Install the skillet-authoring skill globally from https://github.com/getsentry/skillet.
```

If you are the agent handling that request:

1. Install `skills/skillet-authoring` from the repository in user scope, not in the current project.
2. Prefer `npx -y @sentry/dotagents@latest --user add getsentry/skillet skillet-authoring`.
3. Do not create project-local skill files or modify the user's repository.
4. Use `npx -y @sentry/skillet@latest` or `pnpx @sentry/skillet@latest` for later Skillet commands.
5. If installation fails, stop and explain the failure instead of changing the source or scope.

The CLI update notice does not rewrite installed agent skills. To refresh an existing user-scoped installation after a Skillet upgrade, run `npx -y @sentry/dotagents@latest --user install`.

## Start Here

- [Quickstart](/quickstart.md)
- [Create Your First Skill](/first-skill.md)
- [Adopt an Existing Skill](/existing-skill.md)
- [Examples](/examples.md)

## Build a Skill

- [Specifications](/concepts/specifications.md)
- [Write Agent Instructions](/guides/write-agent-instructions.md)
- [Write Honest Evals](/guides/write-honest-evals.md)
- [Understand Eval Results](/concepts/evaluations-and-lift.md)

## How Skillet Works

- [Artifact Lifecycle](/concepts/artifact-lifecycle.md)
- [Configure Harnesses](/guides/configure-harnesses.md)
- [Sandbox and CI](/guides/sandbox-and-ci.md)

## Reference

- [CLI](/reference/cli.md)
- [Eval Case YAML](/reference/eval-case.md)
- [.skillet.yaml](/reference/configuration.md)
