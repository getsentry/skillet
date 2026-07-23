# Design

## Guidance, Not Generation

Skillet cannot mechanically decide whether two natural-language skills are behaviorally equivalent without adding the LLM loop the thin CLI deliberately removed. The fix therefore lives at the existing host-agent boundary: CLI-served instructions, the bundled authoring skill, and an agent eval.

## Preservation Audit

Before drafting `spec.md` for an existing skill, the agent inventories behavior-bearing material from the runtime skill, legacy specs, references, and nearby maintenance docs:

- positive and negative triggers
- ordered workflow and decision points
- exact candidate lists or enumerations
- reviewer, command, or output protocols
- numeric limits and thresholds
- failure handling and stopping rules
- safety constraints and user-work preservation
- runtime references and docs that describe the active contract

Every accepted behavioral rule must land in `spec.md`. Verbose execution detail may additionally remain in a linked runtime reference after the spec defines the observable contract; non-behavior content must be explicitly identified as obsolete or intentionally changed. This is a reconciliation task rather than a requirement to copy all prose.

## Rendering Existing Skills

The skill-rendering instructions continue to favor concise runtime text. They additionally distinguish removable prose from operational specificity: exact formats, thresholds, enumerations, and prompt contracts are behavior and must be represented in `spec.md`. Long supporting material can move to `references/`, but the rendered skill must say when to open it.

After rendering, the agent compares the old and new runtime surfaces and accounts for removed behavior before validation and eval work.

## Regression Coverage

The existing uppercase-spec adoption fixture already contains concrete requirements: list files before deletion, ask before deleting more than ten files, and preserve unrelated files. Its authoring eval will become the fidelity case and require those exact contracts to survive in the new spec and runtime skill.

## Non-Goals

- Add semantic comparison to `skillet validate`.
- Generate migrated artifacts inside the CLI.
- Require verbatim preservation of legacy wording.
- Preserve stale maintenance prose that contradicts the accepted runtime contract.
