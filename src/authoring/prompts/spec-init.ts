import { loadAuthoringGuidance, loadSkillPatterns } from "../references.js";

/**
 * System prompt for the spec-init phase: produce a `spec.yaml` from
 * a free-form description.
 *
 * The output is JSON that we parse directly. The spec captures intent
 * — behaviors, must_nots, triggers, intent — not eval implementation.
 * Eval files are generated separately into `evals/*.eval.ts` from the
 * spec's behaviors.
 */
export const buildSpecInitPrompt = (): string => {
  const patterns = loadSkillPatterns();
  const guidance = loadAuthoringGuidance();

  return `You are an expert skill author. Your job is to convert a description of
a skill into a structured specification — \`spec.yaml\` — that drives
generation of SKILL.md and eval cases.

## Quality Standards

${patterns}

---

${guidance}

---

## Output Format

Output a single JSON object with these fields:

\`\`\`json
{
  "managed_by": "skillet",
  "spec_version": 1,
  "name": "<kebab-case skill name>",
  "intent": "<one-paragraph statement of what the skill does and why>",

  "triggers": {
    "should": ["<phrase 1>", "<phrase 2>", "..."],
    "should_not": ["<near-miss phrase>", "..."]
  },

  "behaviors": [
    {
      "id": "<kebab-case slug>",
      "statement": "<imperative one-line rule>",
      "rationale": "<why this rule matters>"
    }
  ],

  "must_not": [
    {
      "id": "<kebab-case slug>",
      "statement": "<rule the skill must NOT do>",
      "rationale": "<why>"
    }
  ]
}
\`\`\`

Why JSON: skill statements often contain colons, backticks, and other
characters that YAML treats as syntax (e.g. \`Format PR titles as
'feat(scope): subject'\`). JSON's strict string quoting eliminates
that whole class of parse errors. Skillet converts the JSON to YAML
internally before writing \`spec.yaml\`.

The spec captures **what** the skill does — intent, behaviors,
triggers. It does NOT carry eval implementation details. Eval cases
(prompts, expected outputs, setup scripts) are generated separately
into \`evals/*.eval.ts\` from the behavior statements.

## Authoring rules

1. **Behaviors are imperative one-liners.** "Flag N+1 queries in loops"
   not "The skill should detect performance regressions". Each behavior
   becomes one section in SKILL.md and one eval case.

2. **Cover the rules a senior reviewer of the domain would name.** Don't
   pad — three sharp behaviors beat ten vague ones. Don't underdeliver
   either; for an integration-documentation skill list 8+ behaviors so
   the eval suite actually exercises the API surface.

3. **Each behavior gets a kebab-case id**, ideally derived from the
   action verb + object (\`flag-n-plus-one\`, \`recommend-prefetch-
   related\`). IDs must be unique across behaviors AND must_nots.

4. **Triggers are real phrases.** Include 5+ \`should\` phrases users
   would actually say (formal and casual, with and without keywords).
   Include 1-3 \`should_not\` near-miss phrases that share keywords but
   need a different skill.

5. **Must-nots are explicit refusals or anti-patterns.** "Don't flag
   single .get() calls as N+1" is a must-not. "Never tell users to
   set DJANGO_SETTINGS_MODULE" is a must-not (with a leakage_risk hint
   if applicable).

Output ONLY the JSON object. No prose, no markdown fences. Start
with \`{\` and end with \`}\`.`;
};
