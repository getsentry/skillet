/**
 * Pure applier for verify-pass `PlanEdit`s.
 *
 * Edits are applied in input order. Each edit names its target by
 * case name or judge name (not by position), so the edit list is
 * stable across plan structure changes — except for
 * `tighten-regex` and `drop-assertion`, which name an
 * `assertionIndex` interpreted at edit time. If a prior edit
 * shifted indices in a case, later index-based edits target the
 * shifted positions.
 *
 * Throws on:
 * - unknown `kind`
 * - missing target case or judge name
 * - out-of-range `assertionIndex`
 *
 * Throwing keeps the verify pass honest — bad edits surface
 * immediately so eval-gen can fall back to the original plan
 * rather than silently producing a wrong file.
 */

import type {
  AddDeterministicEdit,
  AssertionPlan,
  CasePlan,
  DropAssertionEdit,
  DropJudgeEdit,
  PlanEdit,
  ReplaceJudgeWithDeterministicEdit,
  ShortenCriterionEdit,
  TightenRegexEdit,
} from "./eval-gen-types.js";

export class PlanEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanEditError";
  }
}

export const applyPlanEdits = (plan: AssertionPlan, edits: PlanEdit[]): AssertionPlan => {
  // Deep-clone via structuredClone so the input is never mutated.
  const next = structuredClone(plan);
  for (const [i, edit] of edits.entries()) {
    try {
      applyEdit(next, edit);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new PlanEditError(`edit[${i}] (${edit.kind}): ${msg}`);
    }
  }
  return next;
};

const applyEdit = (plan: AssertionPlan, edit: PlanEdit): void => {
  switch (edit.kind) {
    case "drop-judge":
      return applyDropJudge(plan, edit);
    case "replace-judge-with-deterministic":
      return applyReplaceJudge(plan, edit);
    case "tighten-regex":
      return applyTightenRegex(plan, edit);
    case "shorten-criterion":
      return applyShortenCriterion(plan, edit);
    case "add-deterministic":
      return applyAddDeterministic(plan, edit);
    case "drop-assertion":
      return applyDropAssertion(plan, edit);
    default: {
      const exhaustive: never = edit;
      throw new PlanEditError(`unknown edit kind: ${JSON.stringify(exhaustive)}`);
    }
  }
};

const findCase = (plan: AssertionPlan, name: string): CasePlan => {
  const c = plan.cases.find((x) => x.name === name);
  if (c == null) {
    throw new PlanEditError(`case "${name}" not found`);
  }
  return c;
};

const requireJudgeIndex = (plan: AssertionPlan, name: string): number => {
  const idx = plan.judges.findIndex((j) => j.name === name);
  if (idx < 0) {
    throw new PlanEditError(`judge "${name}" not found`);
  }
  return idx;
};

const applyDropJudge = (plan: AssertionPlan, edit: DropJudgeEdit): void => {
  const idx = requireJudgeIndex(plan, edit.judgeName);
  plan.judges.splice(idx, 1);
  for (const c of plan.cases) {
    c.assertions = c.assertions.filter(
      (a) => !(a.kind === "judge" && a.judgeName === edit.judgeName),
    );
  }
};

const applyReplaceJudge = (plan: AssertionPlan, edit: ReplaceJudgeWithDeterministicEdit): void => {
  const idx = requireJudgeIndex(plan, edit.judgeName);
  if (!Array.isArray(edit.replacements) || edit.replacements.length === 0) {
    throw new PlanEditError(
      `replace-judge-with-deterministic needs at least one replacement assertion`,
    );
  }
  for (const r of edit.replacements) {
    if (r.kind === "judge") {
      throw new PlanEditError(
        `replace-judge-with-deterministic cannot substitute another judge as a replacement`,
      );
    }
  }
  plan.judges.splice(idx, 1);
  for (const c of plan.cases) {
    const out: typeof c.assertions = [];
    for (const a of c.assertions) {
      if (a.kind === "judge" && a.judgeName === edit.judgeName) {
        out.push(...edit.replacements);
      } else {
        out.push(a);
      }
    }
    c.assertions = out;
  }
};

const applyTightenRegex = (plan: AssertionPlan, edit: TightenRegexEdit): void => {
  const c = findCase(plan, edit.caseName);
  const target = c.assertions[edit.assertionIndex];
  if (target == null) {
    throw new PlanEditError(
      `assertionIndex ${edit.assertionIndex} out of range in case "${edit.caseName}"`,
    );
  }
  if (target.kind !== "output-matches") {
    throw new PlanEditError(
      `tighten-regex target is not an output-matches assertion (got "${target.kind}")`,
    );
  }
  target.pattern = edit.pattern;
  if (edit.flags != null) target.flags = edit.flags;
  else delete target.flags;
};

const applyShortenCriterion = (plan: AssertionPlan, edit: ShortenCriterionEdit): void => {
  const idx = requireJudgeIndex(plan, edit.judgeName);
  const judge = plan.judges[idx];
  if (judge == null) {
    throw new PlanEditError(`judge "${edit.judgeName}" not found`);
  }
  if (typeof edit.criterion !== "string" || edit.criterion.trim() === "") {
    throw new PlanEditError(`shorten-criterion needs a non-empty criterion`);
  }
  judge.criterion = edit.criterion;
};

const applyAddDeterministic = (plan: AssertionPlan, edit: AddDeterministicEdit): void => {
  if (edit.assertion.kind === "judge") {
    throw new PlanEditError(`add-deterministic cannot append a judge assertion`);
  }
  const c = findCase(plan, edit.caseName);
  c.assertions.push(edit.assertion);
};

const applyDropAssertion = (plan: AssertionPlan, edit: DropAssertionEdit): void => {
  const c = findCase(plan, edit.caseName);
  if (edit.assertionIndex < 0 || edit.assertionIndex >= c.assertions.length) {
    throw new PlanEditError(
      `assertionIndex ${edit.assertionIndex} out of range in case "${edit.caseName}"`,
    );
  }
  c.assertions.splice(edit.assertionIndex, 1);
};
