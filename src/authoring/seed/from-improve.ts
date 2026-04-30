import type { EvalRunResult } from "../../eval/index.js";
import type { SkillSpec } from "../../spec/index.js";

export interface ImproveSeedResult {
  spec: SkillSpec;
  /**
   * Human-readable digest of the most recent eval failures, surfaced
   * to the author loop as additional context. Empty string when there
   * are no failures to report.
   */
  failureDigest: string;
}

/**
 * Improve seed: produce the existing spec verbatim plus a digest of
 * eval failures the author loop should consider when proposing
 * deltas. No LLM call here — this is a pure data transform.
 *
 * The author loop's job downstream is to translate the failure
 * digest into spec changes (typically new behaviors, refined
 * statements, or added references) and dialogue with the user about
 * which changes to accept.
 */
export const seedFromImprove = (
  spec: SkillSpec,
  evalResult: EvalRunResult | null,
): ImproveSeedResult => {
  if (evalResult == null) {
    return { spec, failureDigest: "" };
  }

  const failingCases = evalResult.cases.filter((c) => c.status === "fail" || c.status === "error");
  if (failingCases.length === 0) {
    return { spec, failureDigest: "" };
  }

  const lines: string[] = [];
  lines.push(`${failingCases.length} eval case(s) failed:`);
  for (const c of failingCases) {
    const reason = c.judge?.reasoning?.trim() ?? c.errors[0]?.message?.trim() ?? "(no reason)";
    lines.push(`- ${c.name}: ${reason}`);
  }
  return { spec, failureDigest: lines.join("\n") };
};
