---
title: Write Honest Evals
description: Test observable outcomes without overfitting to one likely implementation.
type: tutorial
summary: Use checks that directly verify an outcome, and judges for semantic requirements.
---

Use checks that directly verify the required result. Use a judge when the requirement depends on meaning, design, or relationships between files.

Fetch the current case-writing contract before authoring:

```bash
skillet instructions evals --json
```

## Start From a Scenario

Map the specification directly:

- The scenario's **WHEN** becomes the fixture, setup, and prompt.
- The scenario's **THEN** becomes the checks.

Use a realistic user request. Do not quote the skill or tell the agent the expected implementation.

## Use Direct Checks When Possible

Run or inspect the required result:

```yaml
checks:
  - shell: npm test
  - shell: npm run typecheck
  - shell: "git log -1 --format=%s | grep -Eq '^fix:'"
  - file_exists: src/generated/client.ts
```

Useful categories include:

1. Running the produced code or relevant tests.
2. Typechecking or building the result.
3. Inspecting exact filesystem, Git, or process output.
4. Rejecting syntax when that exact syntax is prohibited by the contract.

## Do Not Guess the Implementation

This check does not prove good architecture:

```yaml
- shell: grep -q 'Effect.fn' src/service.ts
```

A valid implementation might use another supported structure. A broken implementation might pass by adding the text in an import or comment.

A deterministic check is unsuitable when:

- A correct alternative implementation can fail it.
- An incorrect implementation can pass by adding matching text.
- It duplicates the semantic judge using weaker evidence.

Deterministic checks run before judges. One weak shell check can prevent the judge from assessing a valid result.

## Use a Judge for Semantic Requirements

```yaml
checks:
  - shell: npm run typecheck
  - judge: >
      Business logic is behind an explicit service with visible dependencies,
      while the HTTP handler only decodes input, invokes the service, and maps
      the transport response.
```

Use one complete judge criterion for design quality, relationships between files, explanation quality, or other semantic properties.

A judge-only case is valid when no direct deterministic proof exists. Do not manufacture grep checks to make the case look more rigorous.

## Check the Case Itself

```bash
skillet validate
skillet eval --dry
skillet eval --trials 3 --baseline
```

`--dry` finds checks that pass before the agent runs. `--baseline` compares the same configured agent with and without this skill.
