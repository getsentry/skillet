# Agent Specification

## Purpose

Skillkit includes a built-in minimal agent runtime for executing eval cases. The agent sends user prompts to an LLM with the skill loaded as system context, handles tool calls, and captures the agent's text output. It is not a full-featured coding agent — it provides the minimum tool surface needed for skills to function during evaluation.

## Requirements

### Requirement: Agent Loop

The system SHALL implement a tool-use agent loop that sends messages to an LLM, executes tool calls, and continues until the model produces a final text response or the timeout is reached.

#### Scenario: Single turn with tool use
- GIVEN a skill that instructs the agent to run `git log`
- WHEN the agent receives the prompt "commit these changes"
- THEN the agent sends the prompt to the LLM with the skill as system context
- AND when the LLM requests a bash tool call, the agent executes it in the workspace
- AND the tool result is sent back to the LLM
- AND the loop continues until the LLM produces a final text response

#### Scenario: Multi-turn conversation
- GIVEN an eval case with `turns: ["create a branch", "now commit the changes"]`
- WHEN the agent processes the case
- THEN the first turn is sent, the agent completes it fully
- AND then the second turn is sent with the conversation history preserved
- AND the output from both turns is captured

#### Scenario: Timeout
- GIVEN an eval case with `timeout: 30000`
- WHEN the agent has been running for 30 seconds without completing
- THEN the agent loop is terminated
- AND the eval case fails with a timeout error

### Requirement: System Prompt Construction

The system SHALL construct the agent's system prompt by combining the skill content (SKILL.md + referenced files) with a minimal instruction prefix that establishes the workspace context.

#### Scenario: Skill with references
- GIVEN a skill with `SKILL.md` that references `references/patterns.md`
- WHEN the agent is initialized for an eval case
- THEN the system prompt includes the full content of SKILL.md
- AND the content of `references/patterns.md` is available for the agent to read via tools

#### Scenario: Workspace context in system prompt
- GIVEN a workspace directory at `/tmp/eval-abc123`
- WHEN the agent is initialized
- THEN the system prompt includes the working directory path
- AND instructs the agent that all tool operations occur relative to that directory

### Requirement: Tool Surface

The agent SHALL provide the following tools, operating within the workspace directory.

| Tool | Purpose |
|------|---------|
| `bash` | Execute shell commands in the workspace |
| `read` | Read file contents |
| `write` | Write file contents |
| `edit` | Make targeted edits to existing files |
| `glob` | Find files by pattern |
| `grep` | Search file contents |

#### Scenario: Bash tool execution
- GIVEN the agent requests a bash tool call with command `git status`
- WHEN the tool executes
- THEN it runs in the workspace directory
- AND returns stdout and stderr to the agent

#### Scenario: Bash tool with dangerous command
- GIVEN the agent requests `rm -rf /`
- WHEN the tool evaluates the command
- THEN the command is rejected (tools operate relative to workspace, and path traversal outside workspace is blocked)

#### Scenario: Read tool
- GIVEN a file `src/main.ts` exists in the workspace
- WHEN the agent requests to read `src/main.ts`
- THEN the file contents are returned

#### Scenario: Write tool
- GIVEN the agent requests to write content to `output.md`
- WHEN the tool executes
- THEN the file is created in the workspace directory

### Requirement: Output Capture

The system SHALL capture all text content the agent produces (non-tool-call responses) across all turns as the eval case's output.

#### Scenario: Output from single turn
- GIVEN an agent that responds with "Created commit: feat(auth): Add login"
- WHEN the turn completes
- THEN `ctx.output` in checks contains "Created commit: feat(auth): Add login"

#### Scenario: Output from multiple turns
- GIVEN two turns where the agent responds "Branch created" and then "Committed"
- WHEN checks evaluate `output_contains`
- THEN the check runs against the concatenated output of all turns

### Requirement: Provider Agnosticism

The agent MUST work with any LLM provider supported by the AI SDK (Anthropic, OpenAI, Google, etc.) without changes to skill behavior.

#### Scenario: Same skill, different providers
- GIVEN a skill and eval case
- WHEN run with `ANTHROPIC_API_KEY` set
- THEN the agent uses Claude
- AND the same eval case can run with `OPENAI_API_KEY` using GPT
- AND both should produce passing results if the skill is well-written
