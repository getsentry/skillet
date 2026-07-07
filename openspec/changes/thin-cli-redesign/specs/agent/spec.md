# Agent Delta

Capability removed: skillet no longer ships an agent runtime. Real coding-agent CLIs (via the harness capability) execute eval cases; host agents perform authoring.

## REMOVED Requirements

### Requirement: Dual-role agent runtime
**Reason**: Both roles are eliminated — evals run through spawned harness CLIs, authoring runs in the host agent.
**Migration**: Configure a harness in `.skillet.yaml`; use generated `/skillet:*` workflows for authoring.

### Requirement: Agent tool surface unchanged
**Reason**: No built-in agent, no tool surface to preserve.
**Migration**: The harness agent brings its own tools.

### Requirement: Agent Loop
**Reason**: The pi-agent-core loop is deleted with the runtime.
**Migration**: None.

### Requirement: System Prompt Construction
**Reason**: The harness agent loads SKILL.md through its native skill mechanism.
**Migration**: None.

### Requirement: Tool Surface
**Reason**: No built-in agent, no tool surface.
**Migration**: None.

### Requirement: Output Capture
**Reason**: Superseded by the harness transcript-capture requirement.
**Migration**: Read transcripts from eval `--json` results.

### Requirement: Provider Agnosticism
**Reason**: Skillet makes no provider calls; agnosticism is inherited by supporting any agent CLI as a harness.
**Migration**: Choose or template a harness command.
