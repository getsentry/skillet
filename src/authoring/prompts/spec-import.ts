/**
 * System prompt for the spec-import phase: extract a `spec.yaml`
 * from an existing SKILL.md (and optionally the existing eval YAMLs)
 * so a legacy skill can be migrated into the spec-driven flow.
 *
 * The output format mirrors `spec-init`. We accept that the resulting
 * spec is only as good as the SKILL.md prose — the user is expected
 * to run `skillet improve` (or `spec refine`) immediately after to
 * tighten anything the importer missed.
 */
export const buildSpecImportPrompt = (): string => {
  return `You are migrating a legacy agent skill into a structured spec.yaml.

You will receive:
1. The current SKILL.md content (the runtime instructions).
2. Optionally, existing eval YAML cases.

Your job is to reverse-engineer the spec the SKILL.md was implicitly
encoding, not to invent new behaviors. The resulting spec should
faithfully represent what the SKILL.md actually says today — flaws
included. The user will run \`skillet improve\` (or \`spec refine\`)
afterwards to tighten the rules.

## Output Format

Output a single JSON object with these fields:

\`\`\`json
{
  "managed_by": "skillet",
  "spec_version": 1,
  "name": "<kebab-case skill name from SKILL.md frontmatter>",
  "class": "<best-fit class>",
  "intent": "<one paragraph extracted from the skill's purpose, NOT invented>",

  "triggers": {
    "should": ["<trigger phrase from the description field>", "..."],
    "should_not": ["<phrase>"]
  },

  "behaviors": [
    {
      "id": "<kebab-case slug>",
      "statement": "<imperative one-line rule the SKILL.md encodes>",
      "rationale": "<rationale actually in the SKILL.md prose>",
      "eval": {
        "prompt": "<copied from existing eval case if present>",
        "expect": "<copied from existing eval case if present>"
      }
    }
  ],

  "must_not": [
    {
      "id": "<kebab-case slug>",
      "statement": "<SKILL.md's explicit 'don't do X' rule>"
    }
  ]
}
\`\`\`

Why JSON: skill statements frequently contain colons, backticks, and
other characters that YAML treats as syntax. JSON eliminates that
whole class of parse errors. Skillet converts the JSON to YAML
before writing \`spec.yaml\`.

\`class\` is one of: workflow-process, integration-documentation,
security-review, skill-authoring, generic. \`eval\` blocks are optional
— include them only when a matching eval case already exists in the
provided eval YAML and links cleanly to this rule.

## Extraction rules

1. **Name and description go straight from frontmatter.** If the
   description has trigger language ("Use when ..."), extract those
   phrases into \`triggers.should\`.

2. **Each behavior maps to one explicit instruction in the body.**
   Look for imperative sentences ("Read the diff", "Recommend
   select_related"), bullet lists of rules, decision tables,
   "always/never" patterns. Don't invent rules that aren't there.

3. **Must-nots come from explicit negative guidance.** "Don't
   mention X", "Never tell the user Y", "Refuse to do Z". If the
   SKILL.md has no negative rules, leave \`must_not\` empty.

4. **If existing eval cases are provided, link them by name.** Look
   for case names matching the \`<id>__<slug>\` convention, or for a
   \`tests_behavior\` field. When you spot a clean linkage, copy the
   case's prompt + expect/criteria into the behavior's \`eval\` block.
   If linkage is ambiguous, leave the eval block off — eval-gen will
   regenerate later.

5. **IDs must be kebab-case slugs unique across behaviors AND
   must_nots.** If you can't decide, omit the id and skillet will
   auto-slugify from the statement.

6. **Don't tighten or improve the rules during import.** A bad
   instruction in SKILL.md should produce a bad behavior in the
   spec. The improve loop's job is to tighten — yours is to capture
   faithfully.

Output ONLY the JSON object. No prose, no markdown fences. Start
with \`{\` and end with \`}\`.`;
};
