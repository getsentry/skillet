import type { Context } from "@mariozechner/pi-ai";
import type { AnyModel } from "../agent/provider.js";
import { completeWithBackoff } from "../agent/complete-with-backoff.js";

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

export interface JudgeArtifact {
  /** The shell command that produced this artifact (e.g. "cat DRAFT_BODY.md") */
  command: string;
  /** The captured stdout */
  stdout: string;
}

const JUDGE_PROMPT = `You are an evaluator judging the quality of an AI agent's output.

You will be given:
1. The agent's transcript (what the agent said, plus any tool use)
2. Optionally, artifacts the agent produced in its workspace (captured
   via workspace check commands like \`cat DRAFT.md\`). When artifacts
   are present, they are the ground-truth deliverable — grade their
   content against the criteria, not the agent's narration of what it did.
3. Evaluation criteria describing what good output looks like

Grade from A to E:
- A: Excellent — fully meets all criteria
- B: Good — meets most criteria with minor gaps
- C: Acceptable — meets some criteria but has notable gaps
- D: Poor — fails to meet most criteria
- E: Failing — does not meet the criteria at all

If the criteria references a named artifact ("the PR body should…",
"the commit message must…") and that artifact is present, grade the
artifact. Use the transcript for criteria about agent behavior
(refusals, clarifying questions, reasoning).

If the criteria clearly references a deliverable artifact the skill
is supposed to produce (a file, a written body, a message), but no
matching artifact is present, DO NOT fall back to grading the
transcript as a substitute — the eval case is malformed and the
result would be misleading. Grade E and say so in the reasoning:
"criteria references artifact X but no matching workspace check was
provided; judged transcript only." This surfaces the miswiring to
the author instead of silently passing.

Respond in this exact format:
GRADE: <letter>
REASONING: <one paragraph explaining your grade>`;

const formatArtifacts = (artifacts: JudgeArtifact[]): string => {
  if (artifacts.length === 0) {
    return "";
  }
  const blocks = artifacts.map(
    (a) => `### Artifact: \`${a.command}\`\n\n\`\`\`\n${a.stdout}\n\`\`\``,
  );
  return `\n\n## Workspace Artifacts\n\n${blocks.join("\n\n")}`;
};

/**
 * Evaluate agent output against criteria using an LLM judge.
 */
export const judge = async (
  model: AnyModel,
  agentOutput: string,
  criteria: string,
  artifacts: JudgeArtifact[] = [],
): Promise<JudgeResult> => {
  const artifactSection = formatArtifacts(artifacts);
  const context: Context = {
    systemPrompt: JUDGE_PROMPT,
    messages: [
      {
        role: "user",
        content: `## Agent Transcript\n\n${agentOutput}${artifactSection}\n\n## Evaluation Criteria\n\n${criteria}`,
        timestamp: Date.now(),
      },
    ],
  };

  const response = await completeWithBackoff(model, context, {
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
