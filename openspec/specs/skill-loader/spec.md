# Skill Loader Specification

## Purpose

The skill loader reads a skill's SKILL.md file and its associated references, then constructs the system prompt context that the agent uses during evaluation. It handles frontmatter parsing, reference file discovery, and prompt assembly.

## Requirements

### Requirement: Skill Root Discovery

The system SHALL locate the skill root by finding the nearest directory containing a `SKILL.md` file, searching from the provided path upward.

#### Scenario: Path is the skill directory
- GIVEN `npx skillkit eval ./my-skill`
- WHEN `./my-skill/SKILL.md` exists
- THEN the skill root is `./my-skill`

#### Scenario: Path is inside the skill directory
- GIVEN `npx skillkit eval ./my-skill/evals`
- WHEN `./my-skill/SKILL.md` exists
- THEN the skill root is `./my-skill`

#### Scenario: No SKILL.md found
- GIVEN a path with no `SKILL.md` in it or any parent
- WHEN discovery runs
- THEN the system reports "no SKILL.md found" and exits with code 1

### Requirement: Frontmatter Parsing

The system SHALL parse YAML frontmatter from `SKILL.md` to extract skill metadata.

#### Scenario: Standard frontmatter
- GIVEN a SKILL.md beginning with:
  ```
  ---
  name: commit
  description: Creates commits following Sentry conventions.
  ---
  ```
- WHEN parsed
- THEN `name` is "commit" and `description` is "Creates commits following Sentry conventions."

#### Scenario: Frontmatter with allowed-tools
- GIVEN frontmatter containing `allowed-tools: Read, Grep, Glob, Bash`
- WHEN parsed
- THEN the tool restriction is noted (for informational purposes in eval results)

#### Scenario: No frontmatter
- GIVEN a SKILL.md with no `---` delimited frontmatter
- WHEN parsed
- THEN the entire file content is treated as the skill body
- AND name defaults to the directory name

### Requirement: Reference File Loading

When the skill body references files (via relative paths in markdown), the system SHALL make those files available to the agent via tools. The system MUST NOT eagerly load all references into the system prompt — the agent reads them on demand, as skills instruct.

#### Scenario: Skill references a patterns file
- GIVEN SKILL.md contains "Read `references/patterns.md`"
- WHEN the agent is initialized
- THEN `references/patterns.md` is accessible via the read tool relative to the skill root
- AND it is NOT automatically included in the system prompt

#### Scenario: Skill has scripts directory
- GIVEN a skill with `scripts/validate.py`
- WHEN the agent requests to run `scripts/validate.py`
- THEN the script is accessible relative to the skill root

### Requirement: System Prompt Assembly

The system SHALL construct the agent's system prompt by including the full SKILL.md content (minus frontmatter) as the primary instructions.

#### Scenario: Prompt includes skill body
- GIVEN a SKILL.md with frontmatter and a body containing "# Security Review\nIdentify exploitable vulnerabilities..."
- WHEN the system prompt is assembled
- THEN the body content is included as the agent's primary instructions

### Requirement: Skill Directory Structure

The system SHALL recognize the following conventional structure but MUST NOT require any directory beyond `SKILL.md` existing.

```
my-skill/
  SKILL.md           # required
  references/        # optional — reference files the skill reads on demand
  scripts/           # optional — executable scripts the skill invokes
  evals/             # optional — eval files (only used by skillkit eval)
    *.eval.yaml
```

#### Scenario: Minimal skill
- GIVEN a directory with only `SKILL.md`
- WHEN loaded
- THEN the skill loads successfully with no references or scripts

#### Scenario: Full skill with all directories
- GIVEN a skill with `references/`, `scripts/`, and `evals/`
- WHEN loaded
- THEN all directories are accessible to the agent via tools
