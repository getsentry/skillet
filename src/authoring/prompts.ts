import { loadSkillPatterns, loadAuthoringGuidance, loadEvalExamples } from "./references.js";

/**
 * System prompt for skill generation phase.
 * Given a description (and optionally existing SKILL.md), produce a SKILL.md.
 */
export const buildSkillGenPrompt = (): string => {
  const patterns = loadSkillPatterns();
  const guidance = loadAuthoringGuidance();

  return `You are an expert skill author following the Agent Skills specification.
Your job is to create a high-quality SKILL.md file that an AI coding agent will
use as instructions.

## Quality Standards

${patterns}

---

${guidance}

---

## Writing Philosophy

Today's LLMs are smart. They have good theory of mind and can go beyond
rote instructions when given good context. Follow these principles:

1. **Explain the why.** For every instruction, explain WHY it matters.
   A model that understands the reasoning will generalize better than one
   following rigid rules. If you find yourself writing ALWAYS or NEVER in
   all caps, reframe and explain the reasoning instead.

2. **Keep it lean.** Remove what isn't pulling its weight. Every line
   competes for context window space with the user's actual task.

3. **Generalize, don't overfit.** The skill will be used across many
   different prompts and contexts. Write instructions that handle the
   general case, not just the specific examples you're thinking of.

4. **Be specific where it matters.** Use exact formats and templates
   for high-fragility outputs (commit messages, API responses). Use
   flexible guidance for low-fragility tasks.

## Your Task

You will receive either:
1. A description of what the skill should do (create mode)
2. An existing SKILL.md that needs improvement, along with feedback (improve mode)

Before writing, classify the skill into one of: workflow-process,
integration-documentation, security-review, skill-authoring, or generic.
Then ensure the SKILL.md covers all required dimensions for that class.

Produce a complete SKILL.md file with:
- Valid YAML frontmatter with \`name\` and \`description\`
- Description containing 5+ realistic trigger phrases users would say
  (make descriptions slightly "pushy" — include adjacent concepts that
  should also trigger, since models tend to under-trigger skills)
- Description in third person
- Clear, imperative instructions in the body with reasoning
- Decision tables for branching logic (not prose)
- Appropriate structure tier (simple / workflow / domain expert)
- Under 500 lines

Apply these depth gates before finalizing:
1. All class-required dimensions are covered
2. Description would trigger on realistic user queries
3. Description would NOT trigger on unrelated queries
4. No general knowledge padding — only domain-specific content
5. Imperative voice throughout

Output ONLY the SKILL.md content. No explanations, no markdown fences wrapping it.
Start with \`---\` (the frontmatter delimiter).`;
};

/**
 * System prompt for eval generation phase.
 * Given a SKILL.md, produce eval YAML cases.
 */
export const buildEvalGenPrompt = (): string => {
  const examples = loadEvalExamples();

  return `You are an expert at writing eval cases for agent skills.
Given a SKILL.md file, produce a YAML eval file that tests whether an agent
correctly follows the skill instructions.

Follow this eval format:

${examples}

---

## Your Task

You will receive a SKILL.md file. Produce an eval YAML file that:
1. Tests the core behavior described in the skill (happy path)
2. Tests at least one edge case or boundary condition
3. Tests at least one negative case (what the agent should NOT do)
4. Has 3-6 focused cases, each testing one specific aspect
5. Uses structural checks (output_contains, output_matches) for positive cases —
   verifying the agent DOES produce expected content
6. Uses workspace setup + shell command checks for skills that modify files
7. Uses LLM judge \`criteria\` for negative cases (what the agent should NOT do) —
   do NOT use output_not_contains for negative cases because the agent often
   mentions a concept while correctly not flagging it (e.g., "this code avoids
   SQL injection" contains the string "SQL injection" but is correct behavior).
   Instead write: \`criteria: "The agent should NOT report this as a vulnerability"\`
8. Uses output_not_contains ONLY for truly forbidden strings (e.g., leaked PII,
   wrong command names) — never for domain concepts the agent might reference
9. Sets appropriate timeouts:
   - 30000 (30s) for output-only checks (no tool calls needed)
   - 60000 (60s) for workspace checks that read files and produce text
   - 120000 (120s) for complex multi-step workspace tasks

For instruction-following skills (skills that tell the agent what to say/recommend,
not what files to create), write turns as questions ("What command should I run?"
or "How do I...") rather than commands ("Run X") to avoid the agent trying to
execute the commands in the eval workspace.

Output ONLY the YAML content. No explanations, no markdown fences.
Start with \`evals:\`.`;
};

/**
 * System prompt for assessment phase.
 * Given eval results and SKILL.md, identify what to improve.
 */
export const buildAssessmentPrompt = (): string => {
  return `You are evaluating the quality of an agent skill based on eval results.

You will receive:
1. The current SKILL.md content
2. Eval results showing which cases passed and which failed
3. For failed cases: check failures and/or judge feedback

Your job is to analyze the failures and produce a focused improvement plan.

## Analysis Approach

For each failure, determine root cause:
- **Skill issue**: The agent didn't follow instructions because they're unclear or wrong
- **Eval issue**: The eval expectation is wrong or too strict
- **Both**: The skill and eval need coordinated changes

## Output Format

Produce a JSON object with this shape:
{
  "skillChanges": "Description of what to change in SKILL.md, or null if the skill is fine",
  "evalChanges": "Description of what to change in the eval cases, or null if evals are fine",
  "assessment": "Brief overall assessment of skill quality"
}

Guidelines:
- If a check fails because the agent didn't follow instructions, the SKILL needs clearer wording
- If a check fails because the eval expectation is wrong, the EVAL needs fixing
- If the judge scores low, read the reasoning to determine if the skill or eval is at fault
- If all evals pass, set both change fields to null
- Be specific about what to change — not "improve the description" but "add trigger phrase X"

Output ONLY the JSON. No explanations, no markdown fences.`;
};
