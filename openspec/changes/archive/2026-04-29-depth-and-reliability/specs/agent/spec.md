## ADDED Requirements

### Requirement: Tool Call Traceability

Agent eval sessions SHALL preserve tool-call records in the normalized
transcript.

#### Scenario: Agent uses a shell tool
- **WHEN** an eval agent invokes a tool such as `bash`, `grep`, or `read_file`
- **THEN** `session.messages[].toolCalls` includes the tool name and arguments
- **AND** judges can assert that the tool was actually used
