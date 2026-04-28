import type { EvalCase } from "../eval/index.js";
import type { EvalRunResult } from "../eval/index.js";
import { isOutputContains, isWorkspaceCheck } from "../eval/index.js";
import type { Behavior, BehaviorEval, MustNot, SkillSpec } from "./types.js";

interface CaseSource {
  case: EvalCase;
}

/**
 * Promote passing LLM-generated eval cases back into the spec's
 * behavior eval blocks.
 *
 * Behaviors and must_nots without an `eval` block in the spec get
 * one invented by `eval-gen`. Those LLM-invented cases are
 * non-deterministic — re-running `improve` produces different cases
 * each time, and a previously-passing case can drift to failing on
 * the next run.
 *
 * Promotion freezes the working case: when a behavior's eval passed
 * AND the spec entry has no `eval` block, we copy the case's
 * prompt + check shape into the spec. Subsequent regens render it
 * mechanically (deterministic path) so the case can never drift.
 *
 * The function returns the updated spec along with a list of which
 * behavior IDs were promoted, so the caller can log it. The input
 * spec is not mutated.
 *
 * Promotion is conservative:
 * - Only spec entries WITHOUT an existing `eval` block are touched.
 *   If the user (or a previous promote) already filled it in, we
 *   never overwrite.
 * - Only cases with status === "pass" are eligible.
 * - The case must be LLM-generated (no `tests_behavior` in the
 *   source eval YAML implies the case-name convention is the only
 *   link, but we still know which spec entry it covers).
 */
export const promotePassingEvals = (
  spec: SkillSpec,
  runResult: EvalRunResult,
  evalFiles: Array<{ path: string; cases: EvalCase[] }>,
): { spec: SkillSpec; promotedIds: string[] } => {
  // Build a lookup from case name → source EvalCase so we can read
  // the original prompt + check shape.
  const sourceByName = new Map<string, CaseSource>();
  for (const file of evalFiles) {
    for (const c of file.cases) {
      sourceByName.set(c.name, { case: c });
    }
  }

  // Build a map of behavior_id → first passing case that tests it.
  // Only one case per id is needed for promotion; ties break by the
  // first encountered.
  const promotionTargets = new Map<string, CaseSource>();
  for (const result of runResult.cases) {
    if (result.status !== "pass") continue;
    const id = result.tests_behavior;
    if (id == null || id === "") continue;
    if (promotionTargets.has(id)) continue;
    const source = sourceByName.get(result.name);
    if (source == null) continue;
    promotionTargets.set(id, source);
  }

  // Apply promotions: for each behavior or must_not without an
  // existing eval block, fill it in from the first passing case.
  const promotedIds: string[] = [];

  const promoteBehaviors: Behavior[] = spec.behaviors.map((b) => {
    if (b.eval != null) return b; // already filled in — never overwrite
    const target = promotionTargets.get(b.id);
    if (target == null) return b;
    const evalBlock = caseToEvalBlock(target.case);
    if (evalBlock == null) return b;
    promotedIds.push(b.id);
    return { ...b, eval: evalBlock };
  });

  const promoteMustNot: MustNot[] = spec.must_not.map((m) => {
    if (m.eval != null) return m;
    const target = promotionTargets.get(m.id);
    if (target == null) return m;
    const evalBlock = caseToEvalBlock(target.case);
    if (evalBlock == null) return m;
    promotedIds.push(m.id);
    return { ...m, eval: evalBlock };
  });

  return {
    spec: { ...spec, behaviors: promoteBehaviors, must_not: promoteMustNot },
    promotedIds,
  };
};

/**
 * Convert an `EvalCase` (the YAML form) into a `BehaviorEval`
 * (the spec form). Returns null when the case shape doesn't map
 * cleanly to a single prompt + assertion — those stay LLM-invented
 * each regen since we don't know how to lock them in.
 */
const caseToEvalBlock = (c: EvalCase): BehaviorEval | null => {
  // We need exactly one prompt — multi-turn cases don't fit the
  // single-prompt eval-block shape.
  if (c.turns.length !== 1) return null;
  const prompt = c.turns[0];
  if (prompt == null || prompt === "") return null;

  const out: BehaviorEval = { prompt };
  if (c.workspace?.setup != null && c.workspace.setup !== "") {
    out.setup = c.workspace.setup;
  }

  // Pick the assertion shape:
  // - `criteria` (judge) — copy verbatim
  // - First `output_contains` — copy as `expect`
  // - First workspace check `cat <file>` + `contains` — also copy as `expect`
  //   (the deterministic renderer doesn't preserve the `cat` shape but the
  //   substring is the load-bearing assertion)
  if (c.criteria != null && c.criteria !== "") {
    out.criteria = c.criteria;
    return out;
  }

  for (const check of c.checks ?? []) {
    if (isOutputContains(check)) {
      out.expect = check.output_contains;
      return out;
    }
    if (isWorkspaceCheck(check) && check.contains != null && check.contains !== "") {
      out.expect = check.contains;
      return out;
    }
  }

  // No supported assertion shape — leave the case LLM-invented.
  return null;
};
