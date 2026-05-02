## Implementation

- [x] Chunk semantic verification and add tolerant JSON-array extraction.
- [x] Preflight generated eval `setup` scripts during eval-gen retries.
- [x] Record actual tool calls in normalized agent sessions.
- [x] Include normalized transcripts and tool calls in CriterionJudge input.
- [x] Expose skill reference files to eval agents as readable resources.
- [x] Give eval tests timeout headroom beyond agent timeout.
- [x] Copy staged files instead of hard-linking live files.
- [x] Update eval-gen prompt for robust setup scripts.
- [x] Update authoring guidance/spec-init prompts for domain-expert depth.
- [x] Allow spec-init to interrupt with a human-facing clarification on high-impact ambiguity.
- [x] Add spec-driven reference metadata, generation, import/refine support, and coverage checks.

## Validation

- [x] `npm run typecheck`
- [x] `npm run check`
- [x] `openspec validate 2026-04-29-depth-and-reliability --strict`
- [x] Smoke semantic verify on a large generated Warden spec if available.
- [x] Re-run validation after reference artifact implementation.
- [x] Clean-room Warden-style code-execution skill: 49/49 evals passing and semantic verify passing.
