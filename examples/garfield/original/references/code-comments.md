# Code Comments Policy

## Intent

Comments explain non-obvious intent, module ownership, invariants, and tradeoffs. They should not narrate obvious code.

## Policy

- Major entry-point modules need a short design comment covering ownership, boundary, and key invariants.
- Exported functions need a brief JSDoc comment explaining intent.
- Private functions need JSDoc when they define an internal interface: handlers/factories, wire or storage formats, signing, durable state changes, reply gates, or retry/resume/compaction/session policy.
- Comment non-obvious invariants, tradeoffs, and policy-driven behavior.
- Keep comments short, concrete, and current.
- Apply this policy to new or changed boundaries, stale touched comments, and behavior made non-obvious by the slice.

## Exceptions

- Do not comment obvious transformations or control flow.
- Do not add comments that simply restate the code in English.
- Small obvious leaf helpers do not need comments.
