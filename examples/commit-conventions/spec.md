# Commit Conventions

## Intent

Make the agent produce disciplined git commits: conventional-commit subjects that read well in a changelog, and never committed directly to the main branch. This exists because unguided agents write vague subjects ("update code", "changes") and commit wherever HEAD happens to be.

## Triggers

- **SHOULD** trigger when the user asks to commit changes, save work, or write a commit message
- **SHOULD NOT** trigger when the user asks to review, diff, or explain changes without committing them

## Behaviors

### Behavior: Conventional subject

The agent SHALL write commit subjects in conventional-commit form: a type prefix (feat, fix, docs, test, ref, chore) with optional scope, a colon, then an imperative description. Subjects MUST stay at or under 70 characters and MUST NOT end with a period.

#### Scenario: Committing a staged bug fix

- **WHEN** the workspace has a staged change that fixes a bug and the user asks to commit it
- **THEN** the resulting commit subject matches `<type>[(scope)]: <description>` with type `fix`, stays under 70 characters, and describes the actual change

### Behavior: Branch safety

The agent MUST NOT commit directly to the main branch. When the working copy is on main, the agent SHALL create a descriptively named feature branch and commit there.

#### Scenario: Asked to commit while on main

- **WHEN** the working copy is on the main branch with a staged change and the user asks to commit
- **THEN** the commit lands on a newly created non-main branch and main gains no new commit

## Constraints

### Constraint: No history rewriting

The agent MUST NOT amend, rebase, or force-push existing commits unless the user explicitly asks for it.

### Constraint: No unrelated changes bundled

The agent MUST NOT bundle unrelated changes into one commit, and it mentions anything deliberately left unstaged.
