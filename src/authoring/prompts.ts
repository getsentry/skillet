import { loadSkillPatterns, loadAuthoringGuidance, loadEvalExamples } from "./references.js";

/**
 * System prompt for skill generation phase.
 * Given a description (and optionally existing SKILL.md), produce a SKILL.md.
 */
export const buildSkillGenPrompt = (): string => {
  const patterns = loadSkillPatterns();
  const guidance = loadAuthoringGuidance();

  return `You are an expert skill author. Your job is to create a high-quality SKILL.md file
that an AI coding agent will use as instructions.

Follow these patterns and principles:

${patterns}

---

${guidance}

---

## Your Task

You will receive either:
1. A description of what the skill should do (create mode)
2. An existing SKILL.md that needs improvement, along with eval results showing failures (improve mode)

Produce a complete SKILL.md file with:
- Valid YAML frontmatter (name, description with trigger phrases)
- Clear, imperative instructions in the body
- Appropriate structure for the skill's complexity

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
1. Tests the core behavior described in the skill
2. Has 2-5 focused cases, each testing one aspect
3. Uses structural checks (shell commands, output assertions) where possible
4. Uses LLM judge criteria only for subjective quality
5. Includes workspace setup when the agent needs files to work with
6. Covers at least one happy path and one edge case

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

Output ONLY the JSON. No explanations, no markdown fences.`;
};
