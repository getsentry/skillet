# Garfield

## Intent

Coordinate subagent review while an agent is implementing code. Garfield keeps the current user or PR intent fixed, selects review tasks from the actual diff, delegates those reviews in bounded batches, fixes only material current-diff issues, and validates the result before handoff.

The skill exists to harden an implementation slice without turning review into a broad redesign, unrelated cleanup pass, or standalone audit.

## Triggers

- **SHOULD** apply when the user asks to use Garfield during implementation, after a meaningful code slice, or before handing off a current change
- **SHOULD** apply when the user asks for a review, fix, and verification pass that may use subagents
- **SHOULD NOT** apply to standalone read-only reviews, brainstorming, non-code work, or PR CI iteration
- **SHOULD NOT** activate automatically without an explicit request

## Behaviors

### Behavior: Capture the Current Intent

The agent SHALL record the requested behavior, intended changes, compatibility expectations, touched areas, non-goals, current diff, repository instructions, relevant specs, and available validation before delegating review.

#### Scenario: Review an Authentication Change

- **WHEN** the user asks for Garfield after implementing an authentication fix
- **THEN** the agent states the intended authentication behavior and non-goals, inspects the current diff and repository guidance, and uses that snapshot for every review decision

### Behavior: Select Reviews From Evidence

The agent SHALL enumerate candidate review tasks, mark each applicable or skipped from concrete diff signals, and combine bundled policies with repository policies without duplicating a concern that the repository already governs.

#### Scenario: Repository Policy Replaces a Bundled Policy

- **GIVEN** the changed repository has a repo-wide testing policy that covers the same concern as Garfield's bundled test policy
- **WHEN** Garfield selects review tasks
- **THEN** the repository policy is used for that concern, the bundled policy is marked superseded, and unrelated review tasks are explicitly skipped

### Behavior: Delegate in Bounded Batches

The agent SHALL use one no-edit subagent for each applicable review task or policy, keep at most three Garfield subagents open at once, and drain completed reviewers before starting more.

#### Scenario: Five Applicable Reviews

- **WHEN** five review tasks apply to a code slice
- **THEN** the agent starts no more than three reviewers, collects and closes completed reviewers, then starts the remaining reviews without relying on hidden queuing

### Behavior: Accept Only Material Findings

The agent SHALL accept a finding only when the current diff introduced or worsened it, made evidence stale, or omitted a required artifact, and when the smallest fix preserves the captured intent.

#### Scenario: Reviewer Suggests an Unrelated Redesign

- **WHEN** a reviewer proposes changing a public API that the requested change did not touch
- **THEN** the agent defers the suggestion instead of expanding the implementation

### Behavior: Fix and Validate the Slice

The agent SHALL fix accepted blocker and high findings when the smallest change preserves intent, fix qualifying medium findings only when local and current-diff-caused, then run the smallest relevant validation commands.

#### Scenario: Missing Regression Test

- **WHEN** a reviewer finds that the current bug fix omitted a focused regression test
- **THEN** the agent adds the test, runs the covering test command, and repeats review only for the material edit

### Behavior: Hand Off Concisely

The agent SHALL finish with pass or blocked status, validation results, independent verification when used, and only residual material or deferred concerns.

#### Scenario: Clean Final Pass

- **WHEN** no current-diff blocker, high, or qualifying medium concerns remain and validation passes
- **THEN** the handoff reports `garfield: pass`, the validation results, and no cycle log or generic advice

## Constraints

### Constraint: No Agentless Substitute

The agent MUST NOT claim Garfield ran when required subagents are unavailable.

### Constraint: No Out-of-Intent Changes

The agent MUST NOT change public behavior, permissions, defaults, validation policy, serialization, or unrelated code unless the user requested it or the current diff caused a regression that requires it.

### Constraint: Preserve User Work

The agent MUST NOT revert unrelated user changes or overwrite work outside the reviewed slice.
