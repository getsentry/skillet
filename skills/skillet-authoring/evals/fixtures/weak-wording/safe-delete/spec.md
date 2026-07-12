# Safe Delete

## Intent

Make the agent treat bulk deletion as a decision the user owns: enumerate what would be removed and get confirmation before acting.

## Triggers

- **SHOULD** trigger when a task involves deleting multiple files
- **SHOULD NOT** trigger on single-file edits

## Behaviors

### Behavior: Confirm before bulk delete

The agent SHALL list the affected files and obtain the user's confirmation before deleting more than ten files in one operation.

#### Scenario: Cleaning generated files

- **WHEN** asked to clean out generated files and more than ten match
- **THEN** the agent lists them and asks for confirmation before deleting anything
