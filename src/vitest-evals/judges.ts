import { judge as runJudge } from "../eval/judge.js";
import { resolveModels } from "../agent/provider.js";
import type { BaseJudgeOptions, JudgeFn, JudgeResult } from "./types.js";

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

interface CriterionJudgeOptions extends BaseJudgeOptions {
  /** The judge criterion (sourced from case data). */
  criteria?: string;
}

/**
 * LLM-based criterion judge. Grades the agent's output against a
 * natural-language criterion sourced from `caseData.criteria`.
 *
 * Returns score 0–1 (mapped from grade A–E). Cases without a
 * `criteria` field score 1 (skipped).
 *
 * The judge model is auto-discovered via `resolveModels()`, matching
 * the rest of skillet's eval path.
 */
export const CriterionJudge = (): JudgeFn => {
  return named("CriterionJudge", async (opts: CriterionJudgeOptions) => {
    const criteria = opts.criteria;
    if (typeof criteria !== "string" || criteria.trim() === "") {
      return { score: 1, metadata: { rationale: "no criteria — skipped" } };
    }
    const model = resolveModels().judge;
    const result = await runJudge(model, opts.output, criteria);
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
