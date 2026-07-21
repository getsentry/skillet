# Direct Deterministic Eval Guidance

## Why

The current eval-writing instructions say to prefer deterministic checks and explicitly suggest grepping committed files. Agents consequently generate string-presence checks for API names and implementation shapes that do not prove the required behavior. These checks can reject valid alternatives, accept token-stuffed failures, and skip the semantic judge that could assess the result correctly.

## What Changes

- Define deterministic checks as direct proof of an observable requirement, not a proxy for a likely implementation.
- Prefer execution, tests, typechecking, builds, and exact filesystem or git state.
- Prohibit string-presence checks for semantic correctness, architecture, or API choice unless the exact text or syntax is itself the requirement.
- Explain that deterministic failures skip judge checks, so deterministic gates must have high precision.
- Explicitly allow judge-only cases when no direct deterministic proof exists.

## Impact

This changes only the instructions returned by `skillet instructions evals`. The eval schema, parser, runner, and existing cases remain unchanged.
