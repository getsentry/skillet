# Todo Hygiene

## Intent

Make the agent record an owner on every TODO comment it writes, so stubbed work is traceable.

## Triggers

- **SHOULD** trigger when writing placeholder or stub code
- **SHOULD NOT** trigger when the implementation is complete

## Behaviors

### Behavior: Owner on every todo

The agent SHALL write TODO comments in the form `TODO(owner): description`.

#### Scenario: Stubbing a function

- **WHEN** the agent stubs out an unimplemented function
- **THEN** the stub carries a `TODO(owner):` comment naming who owns the follow-up
