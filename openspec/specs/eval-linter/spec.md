# Eval Linter Specification

## Purpose

LLM-generated eval YAML frequently contains patterns that are valid YAML but fail at runtime — Python-style regex syntax, missing required fields, unreasonable timeouts, structurally broken checks. The eval linter SHALL validate generated eval content at the AST level before it is written to disk, auto-fixing what it can and rejecting what it cannot.

## Requirements

### Requirement: Regex syntax validation

The linter SHALL validate all regex patterns in `matches` and `output_matches` fields by attempting to compile them as JavaScript RegExp. Python-style inline flags (`(?i)`, `(?s)`, `(?m)`) SHALL be automatically rewritten to JS-compatible form.

#### Scenario: Python inline flag rewriting
- **WHEN** a check contains `matches: "(?i)hello world"`
- **THEN** the linter rewrites it to `matches: "hello world"` and records that the case-insensitive flag should be applied at runtime

#### Scenario: Invalid regex rejected
- **WHEN** a check contains a regex pattern that cannot compile as JS RegExp even after flag extraction
- **THEN** the linter reports an error with the pattern and the RegExp error message

#### Scenario: Valid JS regex passes
- **WHEN** a check contains `matches: "\\d+ items"`
- **THEN** the linter passes it through unchanged

### Requirement: Structure validation

The linter SHALL validate that every eval case has required fields and correct types.

#### Scenario: Missing name
- **WHEN** a case has no `name` field or an empty name
- **THEN** the linter reports an error identifying the case index

#### Scenario: Missing turns
- **WHEN** a case has no `turns` field or an empty array
- **THEN** the linter reports an error

#### Scenario: Turns must be strings
- **WHEN** a turn entry is not a string
- **THEN** the linter reports an error

#### Scenario: Check structure validation
- **WHEN** a check has `run` but none of `matches`, `contains`, `not_contains`, `equals`, `not_equals`, `exits`
- **THEN** the linter reports a warning (check runs a command but asserts nothing)

### Requirement: Timeout validation

The linter SHALL validate that timeout values are within reasonable bounds and auto-fix common issues.

#### Scenario: Timeout too low
- **WHEN** a case has `timeout` less than 5000 (5s)
- **THEN** the linter auto-fixes to 30000

#### Scenario: Timeout too high
- **WHEN** a case has `timeout` greater than 300000 (5min)
- **THEN** the linter auto-fixes to 120000

#### Scenario: Missing timeout gets default
- **WHEN** a case has no `timeout` field
- **THEN** the linter does NOT add one (the runner applies defaults)

### Requirement: Threshold validation

The linter SHALL validate that threshold values are between 0.0 and 1.0.

#### Scenario: Threshold out of range
- **WHEN** a case has `threshold: 5` or `threshold: -1`
- **THEN** the linter auto-fixes to 0.75

#### Scenario: Criteria without threshold
- **WHEN** a case has `criteria` but no `threshold`
- **THEN** the linter passes (runner defaults to 0.75)

### Requirement: YAML parse safety

The linter SHALL catch YAML that parsed but produced unexpected structures.

#### Scenario: Top-level not an object
- **WHEN** the parsed YAML is a string or array instead of an object with `evals` key
- **THEN** the linter reports an error

#### Scenario: Evals not an array
- **WHEN** `evals` is present but not an array
- **THEN** the linter reports an error

### Requirement: Auto-fix pipeline

The linter SHALL return both errors (fatal, cannot write) and fixes (applied automatically). The generation pipeline SHALL run the linter on every LLM-generated eval YAML before writing to disk. If there are only fixes and no errors, the fixed YAML is written. If there are errors, the generation reports them to the assessment phase.

#### Scenario: Auto-fix applied transparently
- **WHEN** the linter finds fixable issues (regex flags, timeout bounds)
- **THEN** it applies fixes and returns the corrected YAML alongside a list of fixes applied

#### Scenario: Errors block write
- **WHEN** the linter finds unfixable errors (invalid regex, missing required fields)
- **THEN** the generation pipeline does NOT write the file and reports errors
