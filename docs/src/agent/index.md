---
title: Skillet
description: Build agent skills from a reviewable specification, evaluate their behavior, and improve them over time.
url: /
---

# Skillet

Skillet helps you build skills without guessing:

Ask your coding agent to create or improve a skill. The authoring skill uses the Skillet CLI to draft the files and run the checks while you review the spec and eval results.

1. Define the contract in `spec.md`.
2. Render the contract into agent instructions.
3. Run realistic eval cases through a coding-agent CLI.
4. Diagnose failures and improve the spec, instructions, or eval.

Skillet does not claim that a passing eval makes a skill universally correct. Evals give you repeatable evidence for the scenarios you define and a way to keep improving the skill.

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
