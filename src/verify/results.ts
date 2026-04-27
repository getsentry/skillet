import type { EvalRunResult } from "../eval/index.js";
import type { SkillSpec } from "../spec/index.js";
import type { BehaviorResultVerdict, ResultsReport } from "./types.js";

/**
 * Layer 3 verification: per-behavior eval result mapping. Given a
 * `EvalRunResult` from a prior eval run, group cases by their
 * `tests_behavior` (or case-name fallback) and report whether each
 * spec entry has a passing case.
 *
 * Verdicts:
 * - `covered+passing`: at least one linked case passed
 * - `covered+failing`: all linked cases failed/errored
 * - `covered+skipped`: all linked cases were skipped (e.g. `requires`)
 * - `uncovered`: no linked cases
 *
 * Loop termination is conditioned on `ResultsReport.ok` rather than
 * raw `summary.fail === 0` — this catches the case where all eval
 * cases passed but some spec behavior had no case at all.
 */
export const verifyResults = (spec: SkillSpec, runResult: EvalRunResult): ResultsReport => {
  type Bucket = { caseNames: string[]; hasPass: boolean; hasFail: boolean; hasSkip: boolean };
  const buckets = new Map<string, Bucket>();

  for (const c of runResult.cases) {
    const id = c.tests_behavior ?? (c.name.includes("__") ? c.name.split("__")[0] : undefined);
    if (id == null || id === "") continue;
    const bucket = buckets.get(id) ?? {
      caseNames: [],
      hasPass: false,
      hasFail: false,
      hasSkip: false,
    };
    bucket.caseNames.push(c.name);
    if (c.status === "pass") bucket.hasPass = true;
    if (c.status === "fail" || c.status === "error") bucket.hasFail = true;
    if (c.status === "skip") bucket.hasSkip = true;
    buckets.set(id, bucket);
  }

  const verdicts: BehaviorResultVerdict[] = [];

  const grade = (id: string, kind: "behavior" | "must_not"): BehaviorResultVerdict => {
    const b = buckets.get(id);
    if (b == null) {
      return {
        id,
        kind,
        status: "uncovered",
        caseNames: [],
        hasPass: false,
        hasFail: false,
        hasSkip: false,
      };
    }
    if (b.hasPass) {
      return { id, kind, status: "covered+passing", ...b };
    }
    if (b.hasFail) {
      return { id, kind, status: "covered+failing", ...b };
    }
    // Only skipped cases (or none of the above flags set, defensive).
    return { id, kind, status: "covered+skipped", ...b };
  };

  for (const beh of spec.behaviors) verdicts.push(grade(beh.id, "behavior"));
  for (const mn of spec.must_not) verdicts.push(grade(mn.id, "must_not"));

  const ok = verdicts.every((v) => v.status === "covered+passing");
  return { ok, behaviors: verdicts };
};
