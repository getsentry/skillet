# Provider Auto-Discovery Specification

## Purpose

Skillet SHALL auto-discover LLM credentials from the runtime environment with zero user configuration. When invoked from inside an agent (Claude Code, Codex, Copilot, Gemini CLI) or on a machine where the user has authenticated with any supported provider, skillet MUST find and use those credentials automatically.

## Requirements

### Requirement: Environment variable auto-discovery

The system SHALL check for LLM provider credentials via environment variables in a defined priority order. The first provider with a valid credential wins.

#### Scenario: Explicit model override takes priority
- **WHEN** `SKILLET_MODEL=anthropic/claude-opus-4-7` is set
- **THEN** that model is used regardless of any other credentials present

#### Scenario: ANTHROPIC_API_KEY detected
- **WHEN** `ANTHROPIC_API_KEY` is set
- **THEN** the Anthropic provider is used with the default Anthropic model

#### Scenario: OPENAI_API_KEY detected
- **WHEN** `OPENAI_API_KEY` is set and no Anthropic key is present
- **THEN** the OpenAI provider is used with the default OpenAI model

#### Scenario: Copilot token detected
- **WHEN** `COPILOT_GITHUB_TOKEN` or `GH_TOKEN` or `GITHUB_TOKEN` is set
- **THEN** the GitHub Copilot provider is used

#### Scenario: No credentials found
- **WHEN** no environment variables or credential stores contain valid credentials
- **THEN** the system exits with a clear error listing all checked sources

### Requirement: Claude Code OAuth auto-discovery (macOS Keychain)

When running as a subprocess of Claude Code on macOS, the system SHALL read the OAuth token from the macOS Keychain since Claude Code scrubs credentials from subprocess environment variables.

#### Scenario: macOS Keychain token found
- **WHEN** the macOS Keychain contains a `Claude Code-credentials` entry with a valid `claudeAiOauth.accessToken`
- **THEN** the system uses that token as the Anthropic API key

#### Scenario: macOS Keychain unavailable
- **WHEN** the Keychain is locked, the entry doesn't exist, or the platform is not macOS
- **THEN** this discovery method is silently skipped and the next method is tried

### Requirement: Claude Code OAuth auto-discovery (Linux credential file)

When running on Linux, Claude Code stores OAuth credentials in `~/.claude/.credentials.json` instead of a system keychain. The system SHALL read from this file as a fallback.

#### Scenario: Linux credentials file found
- **WHEN** the file `~/.claude/.credentials.json` exists and contains `claudeAiOauth.accessToken`
- **THEN** the system uses that token as the Anthropic API key

#### Scenario: Linux credentials file missing or invalid
- **WHEN** `~/.claude/.credentials.json` does not exist, is unreadable, or lacks the expected structure
- **THEN** this discovery method is silently skipped

#### Scenario: Token expiry
- **WHEN** `claudeAiOauth.expiresAt` is present and the token has expired
- **THEN** the system does NOT use the expired token and skips to the next discovery method

### Requirement: OpenAI Codex OAuth auto-discovery

When the user has authenticated with the Codex CLI (ChatGPT Plus/Pro subscription), the system SHALL read stored credentials from `~/.codex/auth.json`.

#### Scenario: Codex auth.json found with API key
- **WHEN** `~/.codex/auth.json` exists and contains a valid API key or OAuth token
- **THEN** the system uses that credential with the OpenAI provider

#### Scenario: Codex auth.json missing
- **WHEN** `~/.codex/auth.json` does not exist
- **THEN** this discovery method is silently skipped

#### Scenario: CODEX_API_KEY environment variable
- **WHEN** `CODEX_API_KEY` is set in the environment
- **THEN** the system uses it as the OpenAI API key

### Requirement: Discovery order

The system SHALL check credential sources in this order:

1. Explicit override: `SKILLET_MODEL` / `SKILLKIT_MODEL`
2. Environment variables (per-provider, in priority order): Anthropic, OpenAI, GitHub Copilot, Google, OpenRouter, Groq, xAI, Mistral, Cerebras
3. Agent-specific env vars: `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`, `CODEX_API_KEY`
4. Credential files: macOS Keychain (`Claude Code-credentials`), `~/.claude/.credentials.json`, `~/.codex/auth.json`

#### Scenario: Multiple credentials available
- **WHEN** both `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are set
- **THEN** Anthropic is used (higher priority)

#### Scenario: Env var empty string
- **WHEN** `ANTHROPIC_API_KEY` is set to an empty string
- **THEN** it is treated as not set and the next source is tried

### Requirement: Separate judge model override

The system SHALL support a separate model override for the LLM judge used in eval scoring, independent of the agent model.

#### Scenario: Judge model override
- **WHEN** `SKILLET_JUDGE_MODEL=anthropic/claude-haiku-4-5` is set
- **THEN** the judge uses that model while the agent uses the auto-discovered model

#### Scenario: No judge override
- **WHEN** `SKILLET_JUDGE_MODEL` is not set
- **THEN** the judge uses the same model as the agent
