# Design

## Decision

Replace the broad “prefer deterministic checks” rule with a proof hierarchy:

1. Execute the relevant behavior through tests or produced code.
2. Typecheck, build, or inspect exact filesystem and git state.
3. Use textual checks only for requirements about exact text or forbidden syntax.
4. Use a judge for architecture, intent, quality, and other semantic properties.

A deterministic check is invalid guidance when a correct alternative can fail it or an incorrect solution can pass by adding matching text.

## Why Prompt Guidance Is Sufficient

The runtime already executes deterministic checks before judges and skips judges after deterministic failure. The problem is not runner behavior or missing check types; it is the authoring prompt encouraging low-quality shell assertions. Tightening the served instructions addresses the source without expanding the schema.

## Non-Goals

- Detect or reject weak shell checks during validation.
- Add new check types.
- Rewrite existing skill evals automatically.
- Change the one-judge-per-case recommendation.
