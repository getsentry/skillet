import { renderClassTable } from "../../spec/index.js";
import { loadAuthoringGuidance, loadSkillPatterns } from "../references.js";
import { OUTPUT_JSON_ONLY, SPEC_JSON_RATIONALE } from "./_spec-output-format.js";

/**
 * System prompt for the description seed: produce a baseline spec
 * from a free-form description, including a proposed `class` and
 * dimensions on each behavior. The author loop runs after this to
 * dialogue with the user and close any class-gate gaps.
 */
export const buildSeedFromDescriptionPrompt = (): string => {
  const patterns = loadSkillPatterns();
  const guidance = loadAuthoringGuidance();
  const classTable = renderClassTable();

  return `You are an expert skill author. Your job is to convert a description of
a skill into a baseline structured specification — \`spec.yaml\` — that
the author loop will refine with the user before generation.

## Quality Standards

${patterns}

---

${guidance}

---

## Skill Class

Pick exactly one \`class\` for the skill. The class declares which
coverage dimensions and reference topics the spec MUST cover before
generation runs. Match these names exactly.

${classTable}

If the request genuinely doesn't fit a named class, use \`generic\` and
choose dimensions explicitly in your behaviors.

## Output Format

Output a single JSON object with these fields:

\`\`\`json
{
  "managed_by": "skillet",
  "spec_version": 1,
  "name": "<kebab-case skill name>",
  "class": "<one of: workflow-process, integration-documentation, security-review, skill-authoring, generic>",
  "intent": "<one-paragraph statement of what the skill does and why>",

  "triggers": {
    "should": ["<phrase 1>", "<phrase 2>", "..."],
    "should_not": ["<near-miss phrase>", "..."]
  },

  "behaviors": [
    {
      "id": "<kebab-case slug>",
      "statement": "<imperative one-line rule>",
      "rationale": "<why this rule matters>",
      "dimensions": ["<class-required dimension this satisfies>", "..."]
    }
  ],

  "must_not": [
    {
      "id": "<kebab-case slug>",
      "statement": "<rule the skill must NOT do>",
      "rationale": "<why>"
    }
  ],

  "references": [
    {
      "path": "references/<slug>.md",
      "title": "<short title>",
      "load_when": "<when the agent should read this file>",
      "purpose": "<why this reference is needed>",
      "topics": ["<class-required topic>", "<topic 2>", "..."]
    }
  ]
}
\`\`\`

${SPEC_JSON_RATIONALE}

## Authoring rules

1. **Pick the class first.** Then write behaviors that cover the class's
   required dimensions. Tag each behavior with the dimension(s) it
   satisfies. The author loop will reject the spec if any required
   dimension is unmatched.

2. **For classes that require reference topics** (security-review,
   integration-documentation, skill-authoring), include reference
   entries whose \`topics\` cover those required topics. Reference paths
   must be one-level files under \`references/\`, e.g.
   \`references/false-positive-traps.md\`.

   Beyond class-required topics, **enumerate references when the
   description signals branched depth**:

   - **CLI tool mentioned by name** (e.g. "git", "gh", "docker",
     "kubectl", "npm", "skillet"): add one reference per major
     subcommand surface the skill needs to cover, e.g.
     \`references/gh-pr-commands.md\` for \`gh pr ...\` ops or
     \`references/git-recovery.md\` for the rollback/reset family.
     The skill-writer agent will then route to those refs in
     SKILL.md instead of inlining every subcommand.

   - **Multiple LLM providers / model families** (e.g. "OpenAI,
     Claude, Gemini" or "GPT-4, Sonnet, …"): add one reference per
     provider whose prompt-shape conventions the skill must
     respect, e.g. \`references/claude-prompt-shapes.md\` (XML
     tags, role markers), \`references/openai-prompt-shapes.md\`
     (system / developer / user hierarchy), etc. Don't bake
     model-specific prompt syntax into core behaviors — the
     references load conditionally based on the target model.

   - **Multiple stacks / frameworks** (e.g. "Django and Rails",
     "Python and Go"): add one reference per stack with its
     framework-specific patterns and idioms.

   - **Multiple deliverable formats** (e.g. "blog post or
     announcement, deep-dive, postmortem"): consider one reference
     per format if the rules differ materially.

   When in doubt, prefer adding a reference over inflating
   \`behaviors[]\` past the class's recommended count. References
   load conditionally; behaviors are always loaded.

3. **Behaviors are imperative one-liners.** "Flag N+1 queries in loops"
   not "The skill should detect performance regressions". Each behavior
   becomes one section in SKILL.md and one eval case.

4. **Match behavior count to the class:**
   - workflow-process: 5-10 behaviors/must_nots
   - integration-documentation: 10-20 behaviors/must_nots
   - security-review: 18-40 behaviors/must_nots spanning detection,
     investigation, false-positive traps, severity calibration, and
     neighboring classes to avoid
   - skill-authoring: 12-25 behaviors/must_nots
   - generic: justified by the request

5. **Each behavior gets a kebab-case id** derived from the action verb +
   object (\`flag-n-plus-one\`, \`recommend-prefetch-related\`). IDs must
   be unique across behaviors AND must_nots.

6. **Triggers are real phrases.** Include 5+ \`should\` phrases users
   would actually say (formal and casual, with and without keywords).
   Include 1-3 \`should_not\` near-miss phrases that share keywords but
   need a different skill.

7. **Must-nots are explicit refusals or anti-patterns.** "Don't flag
   single .get() calls as N+1" is a must-not.

8. **It is fine to leave gaps.** This is a baseline draft — the author
   loop will dialogue with the user to fill in anything ambiguous. Do
   not invent details that require user judgment.

${OUTPUT_JSON_ONLY}`;
};
