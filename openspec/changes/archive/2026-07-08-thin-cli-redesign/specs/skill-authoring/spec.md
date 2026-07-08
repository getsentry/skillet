# Skill Authoring Delta

Capability removed: the in-process authoring loop (spec-author dialogue, orchestrator, bundled writer/validator agents) is deleted. Authoring is agent-driven via the agent-integration capability.

## REMOVED Requirements

### Requirement: Agentic skill authoring loop
**Reason**: `authorSkill()`, the orchestrator, and its re-pass/plateau heuristics are replaced by the host agent following `/skillet:propose` → `/skillet:render` → `skillet validate`/`skillet eval` → `/skillet:improve`.
**Migration**: Run `skillet init --tools <agent>` and use the generated workflows.

### Requirement: Phase-based LLM calls
**Reason**: Skillet issues no LLM calls; phases become agent workflow steps guided by `skillet instructions`.
**Migration**: None.

### Requirement: Iteration control
**Reason**: Iteration is the host agent's loop over failing eval output; skillet just reports results.
**Migration**: The `/skillet:improve` workflow reads `skillet eval --json` failures.

### Requirement: Bundled skill-writer knowledge
**Reason**: Writing guidance no longer ships as bundled agent prompts; the distilled rules are served by `skillet instructions skill` so a CLI upgrade updates all agents.
**Migration**: Guidance content moves into the instructions payloads.
