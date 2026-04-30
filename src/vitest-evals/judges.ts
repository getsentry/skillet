import { judge as runJudge, type JudgeArtifact } from "../eval/judge.js";
import { resolveModels } from "../agent/provider.js";
import type {
  BaseJudgeOptions,
  HarnessRun,
  JudgeFn,
  JudgeResult,
  NormalizedMessage,
} from "./types.js";

/**
 * Tag a JudgeFn with a stable name attribute. vitest-evals uses
 * `judge.name` for reporter output; arrow functions don't get one
 * automatically, so we set it explicitly.
 */
const named = <T extends BaseJudgeOptions>(
  name: string,
  fn: (opts: T) => JudgeResult | Promise<JudgeResult>,
): JudgeFn<T> => {
  Object.defineProperty(fn, "name", { value: name, configurable: true });
  return fn as JudgeFn<T>;
};

/**
 * Convert `HarnessRun.artifacts` (a path → content map populated by
 * skilletHarness with the agent's file edits) into the shape the
 * underlying LLM judge consumes. The judge prompt formats each entry
 * as a workspace artifact so the model grades the file, not just the
 * agent's chat narration of what it did.
 */
const collectArtifactsForJudge = (run: BaseJudgeOptions["run"]): JudgeArtifact[] => {
  const raw = run?.artifacts;
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return [];
  const out: JudgeArtifact[] = [];
  for (const [path, content] of Object.entries(raw)) {
    if (typeof content === "string" && content.length > 0) {
      out.push({ command: `cat ${path}`, stdout: content });
    }
  }
  return out;
};

const stringifyForTranscript = (value: unknown): string => {
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
    if (call.result != null) details.push(`result=${stringifyForTranscript(call.result)}`);
    if (call.error != null) details.push(`error=${call.error.message}`);
    return `  - ${details.join(" ")}`;
  });
  return `\nTool calls:\n${blocks.join("\n")}`;
};

const formatTranscriptForJudge = (run: HarnessRun | undefined, fallbackOutput: string): string => {
  const messages = run?.session.messages ?? [];
  if (messages.length === 0) return fallbackOutput;
  return messages
    .map((message, i) => {
      const content = stringifyForTranscript(message.content);
      const tools = formatToolCalls(message);
      return `### ${i + 1}. ${message.role}\n\n${content}${tools}`;
    })
    .join("\n\n");
};

interface CriterionJudgeOptions extends BaseJudgeOptions {
  /** The judge criterion (sourced from case data). */
  criteria?: string;
}

/**
 * LLM-based criterion judge. Grades the agent's output against a
 * natural-language criterion sourced from `caseData.criteria`.
 *
 * The judge sees both the agent's chat transcript AND any workspace
 * artifacts the harness captured (files the agent created or modified).
 * For coding skills whose deliverable is a file edit, the artifact is
 * the actual thing being graded — without it, the judge has no view
 * of the deliverable and can only grade the agent's narration.
 *
 * Returns score 0–1 (mapped from grade A–E). Cases without a
 * `criteria` field score 1 (skipped).
 */
export const CriterionJudge = (): JudgeFn => {
  return named("CriterionJudge", async (opts: CriterionJudgeOptions) => {
    const criteria = opts.criteria;
    if (typeof criteria !== "string" || criteria.trim() === "") {
      return { score: 1, metadata: { rationale: "no criteria — skipped" } };
    }
    const model = resolveModels().judge;
    const artifacts = collectArtifactsForJudge(opts.run);
    const transcript = formatTranscriptForJudge(opts.run, opts.output);
    const result = await runJudge(model, transcript, criteria, artifacts);
    return {
      score: result.score,
      metadata: { rationale: result.reasoning, grade: result.grade },
    };
  });
};

interface SubstringJudgeOptions extends BaseJudgeOptions {
  /** Literal substring required in the agent's output. */
  expectedContains?: string;
}

/**
 * Cheap structural judge: does the agent's output contain a literal
 * substring? No LLM call. Cases without `expectedContains` score 1
 * (skipped). Used alongside CriterionJudge for fast positive checks.
 *
 * Substring matches are checked against chat output only — for
 * file-deliverable skills, use CriterionJudge with a clear criterion.
 */
export const SubstringJudge = (): JudgeFn => {
  return named("SubstringJudge", (opts: SubstringJudgeOptions) => {
    const expected = opts.expectedContains;
    if (typeof expected !== "string" || expected === "") {
      return { score: 1, metadata: { rationale: "no expectedContains — skipped" } };
    }
    if (opts.output.includes(expected)) {
      return { score: 1, metadata: { rationale: `output contains "${expected}"` } };
    }
    return {
      score: 0,
      metadata: { rationale: `output does NOT contain "${expected}"` },
    };
  });
};
