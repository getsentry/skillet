# Authoring Guidance

## Design Principles

### Conciseness
The context window is shared between skill instructions and the agent's working
memory. Only include what the agent doesn't already know.

**Include:** Domain-specific knowledge, decision logic, output format requirements,
concrete examples of correct behavior.

**Omit:** General programming knowledge, how to use standard tools, obvious
instructions ("be thorough"), lengthy explanations when a table suffices.

**Rule:** If a senior engineer would skip reading it, the agent doesn't need it.

### Degrees of Freedom
Match instruction specificity to task fragility:
- **High fragility** (wrong output is costly): prescriptive steps, exact formats
- **Medium** (multiple valid approaches): guidelines with examples
- **Low** (many correct answers): goals and constraints only

### Progressive Disclosure
Three-tier loading:
1. **Metadata** (always loaded): frontmatter name + description
2. **Instructions** (on activation): SKILL.md body
3. **Resources** (on demand): references/, loaded conditionally

### Imperative Voice
Skills are instructions, not documentation. Use imperative throughout:
- "Read the diff and identify changes" (correct)
- "This skill reads the diff" (avoid)

### Consistent Terminology
Pick one term per concept. Don't alternate between "API endpoint", "URL",
"route", "path" — choose one and use it everywhere.

## Depth Gates

These are mandatory quality checks before a skill is considered complete:

1. No missing high-impact coverage dimensions for the skill's class
2. All class-required dimensions have status `complete` or `partial` with explicit next steps
3. Description validated against should-trigger and should-not-trigger query sets
4. Imperative voice throughout — no descriptive or passive constructions
5. No general knowledge padding — only domain-specific content
6. Tables used for decision logic instead of prose
7. Under 500 lines (or properly extracted to references/)

## Frontmatter Template

```yaml
---
name: my-skill-name
description: >
  What this skill does. Use when asked to "trigger phrase 1",
  "trigger phrase 2", or "trigger phrase 3".
---
```

## Body Template

```markdown
# Core Workflow

## Step 1: Understand Context
<instructions for gathering context>

## Step 2: Execute
<the main task logic, decision tables, examples>

## Step 3: Verify
<how to check the output is correct>

## Reference Loading (if applicable)
| Condition | Load |
|-----------|------|
| Python code | `references/python.md` |
| JS/TS code | `references/javascript.md` |
```

## Quality Checklist

- [ ] Skill class identified and dimensions covered
- [ ] Name matches directory name
- [ ] Description contains realistic trigger phrases (5+ phrases)
- [ ] Description in third person
- [ ] Body uses imperative voice throughout
- [ ] No general programming knowledge included
- [ ] Tables used for decision logic
- [ ] References loaded conditionally, not all at once
- [ ] Under 500 lines (or extracted to references/)
- [ ] No hardcoded paths
- [ ] No time-sensitive information
- [ ] Should-trigger queries would activate this skill
- [ ] Should-not-trigger queries would NOT activate this skill
