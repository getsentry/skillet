# Harness Delta

## MODIFIED Requirements

### Requirement: Built-in reasoning effort

Codex and Claude built-in harnesses SHALL use low reasoning effort unless `--effort` or `.skillet.yaml` selects `low`, `medium`, `high`, or `xhigh`. Skillet SHALL leave the model unset unless the user selects one, allowing the agent CLI's configured/default model to apply. The same resolved effort SHALL apply to agent-under-test and judge sessions. Custom harnesses SHALL receive no automatic effort flags; configured effort SHALL be ignored for custom commands, while an explicit `--effort` flag SHALL be rejected.

#### Scenario: Default Codex invocation

- **WHEN** `skillet eval` uses Codex with no model or effort configured
- **THEN** Codex uses its configured/default model with `model_reasoning_effort="low"`

#### Scenario: Default Claude invocation

- **WHEN** `skillet eval --harness claude` runs without an effort override
- **THEN** Claude uses its configured/default model with `--effort low`

#### Scenario: Model and effort selected

- **WHEN** `.skillet.yaml` sets `harness: claude:sonnet` and `effort: medium`
- **THEN** Claude runs the selected model with medium effort

#### Scenario: Custom harness owns cost controls

- **WHEN** a custom harness command is configured
- **THEN** Skillet does not inject model or effort arguments into that command

#### Scenario: Explicit effort with custom harness

- **WHEN** `--effort` is passed while a custom harness is selected
- **THEN** the eval stops before running cases and explains that effort applies only to built-in harnesses
