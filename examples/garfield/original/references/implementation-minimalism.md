# Implementation Minimalism Policy

## Intent

Implementation slices should solve the requested problem without accumulating speculative guardrails, fallbacks, abstractions, or tests for unlikely states. Defensive code is useful at real boundaries; inside established invariants it often hides defects by converting failures into plausible success.

## Policy

- Implement the smallest clear behavior that satisfies the user goal, existing contract, and validation evidence.
- Do not add defensive checks, broad catches, fallback/default values, retries, compatibility shims, abstractions, or normalization for hypothetical states.
- Trust established types, validated inputs, and ownership boundaries instead of rechecking impossible or already-excluded conditions.
- Do not turn missing required data, invariant violations, or unexpected failures into empty, default, stale, or otherwise successful results unless the contract requires that fallback.
- Remove current-diff guards and adapters that duplicate upstream validation, are unreachable, or only support imagined callers or states.
- Do not add tests solely to justify speculative guardrails. Tests should prove requested behavior, existing contracts, real regressions, or realistic boundary failures.

## Exceptions

- Validate untrusted input and external-system output at the earliest practical trust boundary; avoid repeating the same validation downstream.
- Guardrails are appropriate when required by the explicit user goal, product spec, public API contract, security or permission boundary, data integrity boundary, migration compatibility, or a concrete regression introduced by the slice.
- A cheap local assertion is acceptable when it clarifies a critical invariant and fails visibly rather than inventing recovery behavior.
