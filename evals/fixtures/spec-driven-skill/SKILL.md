---
name: greeting-skill
description: >
  Generate friendly greeting messages for users. Use when asked to
  "greet me", "say hello", "write a welcome message", "greet the user",
  or "hello world".
---

<!--
  This file is derived from spec.yaml. Do NOT edit by hand —
  changes will be overwritten on the next `skillet spec refine`,
  `skillet add-eval`, `skillet improve`, or `skillet create`
  invocation. Edit spec.yaml or use the spec subcommands instead.
-->

# Greeting Skill

## Greet the user by name when a name is provided

Personalization is the core value of the skill — a name should always
be reflected in the greeting.

## Greet "World" when no name is provided

Provide a meaningful default rather than refusing or asking back when
the user just asks for a greeting.

## Don't

- Write farewells when the user asked for a greeting. Greeting and
  farewell are different intents; mixing them confuses the output.
