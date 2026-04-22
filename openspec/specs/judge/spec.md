# Judge Specification

## Purpose

The LLM judge evaluates agent output against natural language criteria when structural checks alone are insufficient. It provides a score from 0.0 to 1.0, compared against a configurable threshold. The judge is a separate LLM call from the agent under test — it receives the agent's output and the criteria string, and grades the result.

## Requirements

### Requirement: Judge Invocation

The judge SHALL be invoked only when a `criteria` field is present on the eval case, and only after all structural `checks` have passed.

#### Scenario: Criteria present, checks pass
- GIVEN an eval case with passing `checks` and a `criteria` string
- WHEN the checks phase completes
- THEN the judge is invoked with the agent output and criteria

#### Scenario: Criteria present, checks fail
- GIVEN an eval case where a structural check fails
- WHEN the checks phase completes
- THEN the judge is NOT invoked
- AND the case fails with the check failure

#### Scenario: No criteria
- GIVEN an eval case with `checks` but no `criteria`
- WHEN all checks pass
- THEN the case passes without invoking the judge

### Requirement: Judge Prompt

The judge SHALL receive a structured prompt containing the agent's full text output and the criteria string. The judge SHALL return a letter grade (A-E) which maps to a numeric score.

#### Scenario: Judge grades output
- GIVEN agent output "Created commit: feat(auth): Add JWT validation" and criteria "The commit message follows conventional commit format with an accurate description"
- WHEN the judge evaluates
- THEN it returns a grade from A to E
- AND the grade maps to a score: A=1.0, B=0.75, C=0.5, D=0.25, E=0.0

### Requirement: Threshold Comparison

The system SHALL compare the judge's score against the eval case's threshold (default 0.75) to determine pass/fail.

#### Scenario: Score meets threshold
- GIVEN a judge score of 0.75 and a threshold of 0.75
- THEN the criteria check passes

#### Scenario: Score below threshold
- GIVEN a judge score of 0.5 and a threshold of 0.75
- THEN the criteria check fails
- AND the failure report includes the judge's score and reasoning

### Requirement: Judge Model Selection

The system SHALL use the same LLM provider as the agent by default, but MUST allow override via `SKILLKIT_JUDGE_MODEL` environment variable.

#### Scenario: Default judge model
- GIVEN no `SKILLKIT_JUDGE_MODEL` set
- WHEN the judge is invoked
- THEN it uses the same provider as the agent

#### Scenario: Explicit judge model
- GIVEN `SKILLKIT_JUDGE_MODEL=openai/gpt-4o`
- WHEN the judge is invoked
- THEN it uses GPT-4o regardless of the agent's model

### Requirement: Judge Output in Results

The system SHALL include the judge's reasoning in eval results for debugging.

#### Scenario: Failed criteria with reasoning
- GIVEN a case that fails the judge evaluation
- WHEN results are reported
- THEN the output includes the judge's letter grade, numeric score, and the reasoning text explaining why
