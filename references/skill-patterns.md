# Skill Patterns

## Skill Classes

Classify the target skill before authoring. Each class has required coverage dimensions.

| Class | When to use | Required dimensions |
|-------|-------------|---------------------|
| `workflow-process` | Repeatable operations, CI/task orchestration | Preconditions, ordered flow, failure handling, safety boundaries |
| `integration-documentation` | Library/framework integration, SDK usage | API surface, config options, common use cases, known issues/workarounds |
| `security-review` | Vulnerability finding, exploitability review | Vulnerability classes, exploit paths, false-positive controls, remediations |
| `skill-authoring` | Creating/updating/evaluating other skills | Source provenance, depth gates, transformed examples |
| `generic` | Does not match above | Explicit dimensions chosen and justified |

## Structure Tiers

### Simple (SKILL.md only)
Use when the skill fits in under ~200 lines. Single file, no references.
Good for: brand guidelines, commit conventions, PR writing.

### Workflow (SKILL.md + scripts/)
Use when the skill automates a multi-step process with structured data.
Scripts output JSON. Document each script's interface in SKILL.md.

### Domain Expert (SKILL.md + references/)
Use when the domain is too large for one file. SKILL.md has the core workflow;
references/ has deep knowledge loaded conditionally based on context.

## SKILL.md Requirements

1. Frontmatter must be first line, delimited by `---`
2. Required fields: `name`, `description`
3. Body in imperative voice ("Read the file", not "The file should be read")
4. Use `##` sections for logical grouping
5. Tables for decision logic and examples
6. Keep under 500 lines — extract to references/ if longer

## Description Field

The description determines when agents activate the skill. It must contain
the phrases users actually say.

**Pattern:** `<What it does>. Use when <trigger phrases>.`

```yaml
# Good
description: Security code review for vulnerabilities. Use when asked to
  "security review", "find vulnerabilities", "audit security".

# Bad
description: A helpful skill for code quality.
```

Write in third person. Include all "when to use" info in the description,
not the body — the body is only loaded after triggering.

**Validate triggers with two query sets:**
- Should-trigger: queries that MUST activate this skill
- Should-NOT-trigger: queries that must NOT activate this skill

## Workflow Patterns

### Sequential
Break complex tasks into numbered steps with an overview early:
```markdown
1. Analyze the input
2. Create a plan
3. Execute the plan
4. Verify the result
```

### Conditional
Guide agents through decision points:
```markdown
**Creating new content?** → Follow "Creation workflow" below
**Editing existing content?** → Follow "Editing workflow" below
```

### Feedback Loops
Use validate-fix-repeat for quality-sensitive tasks:
```markdown
1. Make changes
2. Validate: run checks
3. If validation fails: fix and re-validate
4. Only proceed when validation passes
```

## Output Patterns

### Decision Tables
Use when output depends on input characteristics:
```markdown
| Input Type | Action |
|-----------|--------|
| Single file | Inline summary |
| Multiple files | Grouped report |
```

### Template Pattern
Provide exact templates for strict-format outputs.

### Examples Pattern
Use code examples when they do work prose can't. See "Code Examples"
in `authoring-guidance.md` for when an example earns its place.

## Reference Files

- Load conditionally based on detected context (language, framework, etc.)
- Each file self-contained and focused on one topic
- Include a file index in SKILL.md so the agent knows what's available
- Files over 100 lines should include a table of contents
- One level deep from SKILL.md (no nested chains)

## Anti-Patterns

- Over-long SKILL.md (>500 lines) → extract to references/
- Missing trigger keywords in description → include natural user phrases
- Unconditional reference loading → use decision tables
- Duplicating project conventions → reference CLAUDE.md/AGENTS.md instead
- Hardcoded paths → use relative paths from skill root
- Time-sensitive information → use "legacy" sections with deprecation notes
- Trigger info in body instead of description → move to description field
