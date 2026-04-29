# Authoring Guidance

## Spec-Driven Authoring

Skillet authors skills via a structured `spec.yaml` that captures
intent, behaviors, must-nots, and triggers. SKILL.md and eval YAMLs
are derived from the spec — never hand-edited.

The spec → SKILL.md mapping is 1:1: each behavior in the spec
becomes one section in SKILL.md, and each behavior or must_not
becomes exactly one eval case (named `<id>__<slug>`, tagged
`tests_behavior: <id>`). This 1:1 mapping is what makes coverage
trivially checkable — every behavior either has a passing case or
the skill isn't done.

Iteration patches the spec, not the prose: assessment produces
`SpecPatch[]` operations (update_behavior, add_eval, etc.) that the
patcher applies deterministically. The loop converges on a stable
spec rather than churning SKILL.md and eval YAMLs across iterations.

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
Skills are instructions to an agent, not documentation about a skill.
Use imperative throughout the body, including subsections and examples:

| Imperative (correct) | Descriptive / passive (avoid) |
|---|---|
| "Read the diff and identify changes." | "This skill reads the diff." |
| "Run the tests before committing." | "The tests are run before commit." |
| "If the branch is `main`, create a feature branch first." | "When on main, a feature branch should be created." |
| "Extract each rule into its own eval case." | "Rules should be extracted into eval cases." |

The description and frontmatter are the only places that talk *about*
the skill. Everywhere else, speak *as* the skill addressing the agent.

### Independence
A skill's runtime behavior must not depend on another skill being
present. Do not instruct the agent to invoke another skill by name
(`use the X skill`, `run sentry-skills:Y`, `hand off to Z`), and do not
treat another skill's files as runtime resources (`load
skills/other-skill/references/foo.md`). Other skills may not be
installed, may be renamed, or may be shadowed by the user's own skill
of the same name — any runtime dependency silently breaks in all three
cases.

State the intent directly; trust skill discovery to pick up whatever
skill matches.

| Do | Don't |
|----|-------|
| "If you're on `main`, create a feature branch first." | "Use the `create-branch` skill to create the branch." |
| "If there are uncommitted changes, commit them first." | "Run the `sentry-skills:commit` skill before proceeding." |
| "For deeper guidance on X, see `references/x.md`." | "See the `other-skill` skill for X." |

Mentioning another skill's name in non-runtime content — provenance
logs, audit allowlists, eval prompts meant for humans to copy — is
fine. The rule targets runtime behavior, not any mention.

### Consistent Terminology
Pick one term per concept. Don't alternate between "API endpoint", "URL",
"route", "path" — choose one and use it everywhere.

### Code Examples
Use code examples when they make a rule concrete that prose alone leaves
abstract. Skip them when the rule is clear without one.

The test: write the rule and rationale first, then read it back. Is the
rule actionable as written? If yes, an added example is decoration. If a
reader would still need to ask "what does that look like?", that's when
an example earns its place.

Examples tend to help when:
- The rule names an anti-pattern whose alternative shape isn't obvious
  in words. "Don't nest ternaries" reads ambiguously until the agent
  sees the `if/else` shape written out.
- The rule refers to an idiom whose specific shape carries meaning
  prose can't compress (Result types, framework hooks, builder patterns).
- A behavior has multiple plausible interpretations and the example
  pins down which one is meant.

Examples tend not to help when:
- The rule is unambiguous in prose ("use ES modules", "explicit return
  types"). An example just restates it in a different format.
- The example is generic enough to illustrate several different rules —
  the agent learns nothing from the shape.
- They accumulate. A few well-chosen examples teach more than many
  forgettable ones.

Match length to what the rule needs. Short when short suffices, longer
when the shape needs room. Don't pad and don't truncate past clarity.

## Depth Gates

These are mandatory quality checks before a skill is considered complete:

1. No missing high-impact coverage dimensions for the skill's class
2. All class-required dimensions have status `complete` or `partial` with explicit next steps
3. Description contains **5+ realistic trigger phrases** users would actually say
4. Description validated against should-trigger and should-not-trigger query sets
5. Imperative voice throughout — no descriptive or passive constructions
6. No runtime references to other skills by name (independence)
7. No general knowledge padding — only domain-specific content
8. Tables used for decision logic instead of prose
9. Under 500 lines (or properly extracted to references/)

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
