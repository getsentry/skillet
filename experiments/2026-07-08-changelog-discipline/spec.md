# Changelog Discipline

## Intent

Make the agent keep CHANGES.md current: every code change it performs is recorded as a formatted entry under the Unreleased section, without the user having to ask. This exists because agents reliably make the code change and silently skip the bookkeeping, and because unformatted or misplaced entries make the changelog useless for release notes.

## Triggers

- **SHOULD** trigger when the agent adds, changes, fixes, or removes code in a repository
- **SHOULD NOT** trigger when the agent only answers questions, explains code, or performs read-only tasks

## Behaviors

### Behavior: Record every code change

After making any code change, the agent SHALL add an entry describing it to CHANGES.md under the "## Unreleased" heading, in the same working session as the change.

#### Scenario: Feature added without mentioning the changelog

- **WHEN** the user asks for a new function in an existing file and CHANGES.md already has an Unreleased section
- **THEN** the code change lands and CHANGES.md gains a new entry under "## Unreleased" describing it

### Behavior: Entry format

Entries SHALL be single lines of the exact form `- <type>: <summary>` where `<type>` is one of added, changed, fixed, removed, and the summary is imperative mood and at most 80 characters.

#### Scenario: Bug fix entry

- **WHEN** the agent fixes a bug and records it
- **THEN** the new entry matches `- fixed: <imperative summary>` within the length limit

### Behavior: Create the changelog when missing

When CHANGES.md does not exist, the agent SHALL create it with a `# Changelog` title followed by an `## Unreleased` section before recording the entry.

#### Scenario: First change in a repo without a changelog

- **WHEN** the agent makes a code change in a repository with no CHANGES.md
- **THEN** CHANGES.md exists afterward with "# Changelog" as its first heading, an "## Unreleased" section, and the new entry under it

### Behavior: Preserve released sections

The agent MUST NOT edit, reorder, or delete existing released version sections (e.g. "## 1.0.0 - 2026-01-15") when adding entries.

#### Scenario: Adding an entry above released history

- **WHEN** CHANGES.md contains a released section and the agent records a new change
- **THEN** every line of the released section is byte-identical to before

### Behavior: Stay quiet on read-only tasks

For questions, explanations, and other read-only tasks the agent MUST NOT modify CHANGES.md or any other file.

#### Scenario: Question about existing code

- **WHEN** the user asks what a function returns, with CHANGES.md present
- **THEN** no file in the repository is modified

## Constraints

### Constraint: No invented history

The agent MUST NOT fabricate entries for changes it did not make, and MUST NOT add version headings or release dates on its own.
