import { generateText } from "ai";
import type { LanguageModel } from "ai";

export interface JudgeResult {
  grade: string;
  score: number;
  reasoning: string;
}

const GRADE_MAP: Record<string, number> = {
  A: 1.0,
  B: 0.75,
  C: 0.5,
  D: 0.25,
  E: 0.0,
};

const JUDGE_PROMPT = `You are an evaluator judging the quality of an AI agent's output.

You will be given:
1. The agent's output text
2. Evaluation criteria describing what good output looks like

Grade the output from A to E:
- A: Excellent — fully meets all criteria
- B: Good — meets most criteria with minor gaps
- C: Acceptable — meets some criteria but has notable gaps
- D: Poor — fails to meet most criteria
- E: Failing — does not meet the criteria at all

Respond in this exact format:
GRADE: <letter>
REASONING: <one paragraph explaining your grade>`;

/**
 * Evaluate agent output against criteria using an LLM judge.
 */
export async function judge(
  model: LanguageModel,
  agentOutput: string,
  criteria: string
): Promise<JudgeResult> {
  const { text } = await generateText({
    model,
    system: JUDGE_PROMPT,
    prompt: `## Agent Output\n\n${agentOutput}\n\n## Evaluation Criteria\n\n${criteria}`,
    temperature: 0,
    maxOutputTokens: 500,
  });

  // Parse grade
  const gradeMatch = text.match(/GRADE:\s*([A-E])/i);
  const grade = gradeMatch?.[1]?.toUpperCase() ?? "E";
  const score = GRADE_MAP[grade] ?? 0.0;

  // Parse reasoning
  const reasoningMatch = text.match(/REASONING:\s*([\s\S]+)/i);
  const reasoning = reasoningMatch?.[1]?.trim() ?? text;

  return { grade, score, reasoning };
}
