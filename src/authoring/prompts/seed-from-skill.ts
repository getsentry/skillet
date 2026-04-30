import { renderClassTable } from "../../spec/index.js";
import { OUTPUT_JSON_ONLY, SPEC_JSON_RATIONALE } from "./_spec-output-format.js";

/**
 * System prompt for the existing-skill seed: reverse-derive a
 * baseline spec from an existing SKILL.md. The author loop refines
 * after this with the user.
 */
export const buildSeedFromSkillPrompt = (): string => {
  const classTable = renderClassTable();

  return `You are migrating a legacy agent skill into a structured spec.yaml.

You will receive the current SKILL.md content (the runtime instructions).

Your job is to reverse-engineer the spec the SKILL.md was implicitly
encoding, not to invent new behaviors. The resulting spec should
faithfully represent what the SKILL.md actually says today — flaws
included. The author loop runs after this to refine with the user.

## Skill Class

Pick exactly one \`class\` based on what the SKILL.md actually does.
Don't promote a shallow skill into a heavier class just to match the
table — pick what fits.

${classTable}

## Output Format

Output a single JSON object with these fields:

\`\`\`json
{
  "managed_by": "skillet",
  "spec_version": 1,
  "name": "<kebab-case skill name from SKILL.md frontmatter>",
  "class": "<one of: workflow-process, integration-documentation, security-review, skill-authoring, generic>",
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
      "dimensions": ["<class-required dimension this behavior satisfies, if any>"]
    }
  ],

  "must_not": [
    {
      "id": "<kebab-case slug>",
      "statement": "<SKILL.md's explicit 'don't do X' rule>"
    }
  ],

  "references": [
    {
      "path": "references/<slug>.md",
      "title": "<title from SKILL.md or path-derived title>",
      "load_when": "<condition described in SKILL.md>",
      "purpose": "<why SKILL.md says to load it>",
      "topics": ["<topic from surrounding context>", "..."]
    }
  ]
}
\`\`\`

${SPEC_JSON_RATIONALE}

## Extraction rules

1. **Name and description go straight from frontmatter.** If the
   description has trigger language ("Use when ..."), extract those
   phrases into \`triggers.should\`.

2. **Each behavior maps to one explicit instruction in the body.**
   Look for imperative sentences ("Read the diff", "Recommend
   select_related"), bullet lists of rules, decision tables,
   "always/never" patterns. Don't invent rules that aren't there.

3. **Dimensions are inferred from the class definition.** Only tag a
   behavior with a class-required dimension if the SKILL.md actually
   addresses it. Leave \`dimensions\` empty when the SKILL.md is silent
   — the author loop will surface the gap to the user.

4. **Must-nots come from explicit negative guidance.** "Don't
   mention X", "Never tell the user Y", "Refuse to do Z". If the
   SKILL.md has no negative rules, leave \`must_not\` empty.

5. **References come from explicit reference-loading guidance.** If
   SKILL.md names files under \`references/\`, capture them in
   \`references[]\` with the exact path. Infer \`title\`, \`load_when\`,
   \`purpose\`, and \`topics\` from the table, heading, or nearby prose.
   Do not invent new reference files during import.

6. **IDs must be kebab-case slugs unique across behaviors AND
   must_nots.** If you can't decide, omit the id and skillet will
   auto-slugify from the statement.

7. **Don't tighten or improve the rules during import.** A bad
   instruction in SKILL.md should produce a bad behavior in the
   spec. The author loop's job is to tighten — yours is to capture
   faithfully.

${OUTPUT_JSON_ONLY}`;
};
