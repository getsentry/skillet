/**
 * Sugar over upstream `namedJudge` for the common case: a named
 * LLM-as-judge that scores a single criterion string against the
 * agent's transcript + workspace artifacts.
 *
 * Most generated `evals/_judges.ts` exports look like:
 *
 * ```ts
 * export const FooJudge = criterionJudge(
 *   "FooJudge",
 *   "The response identifies the privileged trigger and the missing repo guard.",
 * );
 * ```
 */

import { type JudgeContext, type JudgeFn, type NormalizedMessage, namedJudge } from "vitest-evals";
import { resolveModels } from "../agent/provider.js";
import { judge as runJudgeLLM, type JudgeArtifact } from "../eval/judge.js";

/**
 * Build a `JudgeFn<JudgeContext>` that evaluates `criterionText`
 * against the harness run via skillet's LLM judge. The returned
 * fn is wrapped with `namedJudge(name, ...)` so the upstream
 * matcher and reporter pick up the stable display name.
 */
export const criterionJudge = (name: string, criterionText: string): JudgeFn<JudgeContext> => {
  const fn = async (ctx: JudgeContext) => {
    const transcript = formatTranscript(ctx);
    const artifacts = collectArtifacts(ctx);
    const model = resolveModels().judge;
    const result = await runJudgeLLM(model, transcript, criterionText, artifacts);
    return {
      score: result.score,
      metadata: { rationale: result.reasoning, grade: result.grade },
    };
  };
  return namedJudge(name, fn);
};

const collectArtifacts = (ctx: JudgeContext): JudgeArtifact[] => {
  const raw = ctx.run.artifacts;
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return [];
  const out: JudgeArtifact[] = [];
  for (const [path, content] of Object.entries(raw)) {
    if (typeof content === "string" && content.length > 0) {
      out.push({ command: `cat ${path}`, stdout: content });
    }
  }
  return out;
};

const stringify = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return Object.prototype.toString.call(value);
  }
};

const formatToolCalls = (message: NormalizedMessage): string => {
  const calls = message.toolCalls ?? [];
  if (calls.length === 0) return "";
  const blocks = calls.map((call) => {
    const details: string[] = [`name=${call.name}`];
    if (call.arguments != null) details.push(`args=${JSON.stringify(call.arguments)}`);
    if (call.result != null) details.push(`result=${stringify(call.result)}`);
    if (call.error != null) details.push(`error=${call.error.message}`);
    return `  - ${details.join(" ")}`;
  });
  return `\nTool calls:\n${blocks.join("\n")}`;
};

const formatTranscript = (ctx: JudgeContext): string => {
  const messages = ctx.session.messages;
  if (messages.length === 0) return ctx.output;
  return messages
    .map((message, i) => {
      const content = stringify(message.content);
      const tools = formatToolCalls(message);
      return `### ${i + 1}. ${message.role}\n\n${content}${tools}`;
    })
    .join("\n\n");
};
