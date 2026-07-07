# Provider Autodiscovery Delta

Capability removed: skillet makes no LLM calls, so there are no credentials to discover. Harness CLIs (codex, claude, custom) manage their own authentication.

## REMOVED Requirements

### Requirement: Environment variable auto-discovery
**Reason**: No provider calls remain in skillet.
**Migration**: Authenticate the harness CLI itself (e.g. `codex login`, `claude login`).

### Requirement: Claude Code OAuth auto-discovery (macOS Keychain)
**Reason**: No provider calls remain in skillet.
**Migration**: None.

### Requirement: Claude Code OAuth auto-discovery (Linux credential file)
**Reason**: No provider calls remain in skillet.
**Migration**: None.

### Requirement: OpenAI Codex OAuth auto-discovery
**Reason**: No provider calls remain in skillet.
**Migration**: None.

### Requirement: Discovery order
**Reason**: No provider calls remain in skillet.
**Migration**: None.

### Requirement: Separate judge model override
**Reason**: Judges run through the harness; there is no judge model to override.
**Migration**: Delete `SKILLET_JUDGE_MODEL`.
