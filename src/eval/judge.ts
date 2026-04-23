import { complete } from "@mariozechner/pi-ai";
import type { Context } from "@mariozechner/pi-ai";
import type { AnyModel } from "../agent/provider.js";

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
export const judge = async (
  model: AnyModel,
  agentOutput: string,
  criteria: string,
): Promise<JudgeResult> => {
  const context: Context = {
    systemPrompt: JUDGE_PROMPT,
    messages: [
      {
        role: "user",
        content: `## Agent Output\n\n${agentOutput}\n\n## Evaluation Criteria\n\n${criteria}`,
        timestamp: Date.now(),
      },
    ],
  };

  const response = await complete(model, context, {
    maxTokens: 500,
  });

  // Extract text from content blocks using type guard narrowing
  const text = response.content
    .filter((b): b is { type: "text"; text: string; textSignature?: string } => b.type === "text")
    .map((b) => b.text)
    .join("");

  // Parse grade
  const gradeMatch = /GRADE:\s*([A-E])/i.exec(text);
  const grade = gradeMatch?.[1]?.toUpperCase() ?? "E";
  const score = GRADE_MAP[grade] ?? 0.0;

  // Parse reasoning
  const reasoningMatch = /REASONING:\s*([\s\S]+)/i.exec(text);
  const reasoning = reasoningMatch?.[1]?.trim() ?? text;

  return { grade, score, reasoning };
};
