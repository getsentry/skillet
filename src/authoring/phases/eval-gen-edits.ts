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
  AddJudgeEdit,
  AssertionPlan,
  CasePlan,
  DropAssertionEdit,
  DropJudgeEdit,
  JudgePlan,
  PlanEdit,
  RenameJudgeEdit,
  ReplaceJudgeWithDeterministicEdit,
  ShortenCriterionEdit,
  SplitJudgeEdit,
} from "./eval-gen-types.js";

const JUDGE_NAME_RE = /^[A-Z][A-Za-z0-9]*Judge$/;

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
  // Defense in depth — a stale verifier prompt could still emit a
  // `tighten-regex` edit (the kind is gone but the JSON shape lives
  // on in cached prompt template strings). Reject explicitly with a
  // pointer to the new edit kinds.
  // oxlint-disable-next-line no-unsafe-type-assertion
  const kindStr = (edit as { kind: string }).kind;
  if (kindStr === "tighten-regex") {
    throw new PlanEditError(
      `edit kind "tighten-regex" is no longer supported (regex assertions were banned). Use "split-judge", "replace-judge-with-deterministic", or "add-judge" instead.`,
    );
  }
  switch (edit.kind) {
    case "drop-judge":
      return applyDropJudge(plan, edit);
    case "replace-judge-with-deterministic":
      return applyReplaceJudge(plan, edit);
    case "split-judge":
      return applySplitJudge(plan, edit);
    case "add-judge":
      return applyAddJudge(plan, edit);
    case "rename-judge":
      return applyRenameJudge(plan, edit);
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

const validateNewJudge = (judge: JudgePlan, plan: AssertionPlan, ctx: string): void => {
  if (typeof judge.name !== "string" || !JUDGE_NAME_RE.test(judge.name)) {
    throw new PlanEditError(
      `${ctx}: judge name "${judge.name}" must be PascalCase ending in "Judge"`,
    );
  }
  if (typeof judge.criterion !== "string" || judge.criterion.trim() === "") {
    throw new PlanEditError(`${ctx}: judge "${judge.name}": criterion must be non-empty`);
  }
  if (plan.judges.some((j) => j.name === judge.name)) {
    throw new PlanEditError(`${ctx}: judge "${judge.name}" is already declared in plan.judges`);
  }
};

const applySplitJudge = (plan: AssertionPlan, edit: SplitJudgeEdit): void => {
  const idx = requireJudgeIndex(plan, edit.judgeName);
  if (!Array.isArray(edit.replacements) || edit.replacements.length < 2) {
    throw new PlanEditError(
      `split-judge needs at least 2 replacements (a single replacement is just a rename — use replace-judge-with-deterministic or shorten-criterion instead)`,
    );
  }
  if (!Array.isArray(edit.caseAssignments) || edit.caseAssignments.length === 0) {
    throw new PlanEditError(
      `split-judge needs caseAssignments — at least one replacement judge name to wire into the cases`,
    );
  }

  // Validate replacement judges. The split judge itself was just
  // removed from `plan.judges` view, but it's still in the array
  // until we splice — so validation against `plan.judges` excludes
  // the replaced entry.
  const transient: AssertionPlan = { judges: [...plan.judges], cases: plan.cases };
  transient.judges.splice(idx, 1);
  for (const r of edit.replacements) {
    validateNewJudge(r, transient, `split-judge for "${edit.judgeName}"`);
    transient.judges.push(r);
  }

  // Each caseAssignment name must reference one of the replacements.
  const replacementNames = new Set(edit.replacements.map((r) => r.name));
  for (const name of edit.caseAssignments) {
    if (!replacementNames.has(name)) {
      throw new PlanEditError(
        `split-judge: caseAssignment "${name}" is not one of the replacement names (${[
          ...replacementNames,
        ].join(", ")})`,
      );
    }
  }

  // Apply: replace the judge declaration with the replacements;
  // rewrite each case's referencing judge assertion as N consecutive
  // judge assertions for the names in caseAssignments.
  plan.judges.splice(idx, 1, ...edit.replacements);
  for (const c of plan.cases) {
    const out: typeof c.assertions = [];
    for (const a of c.assertions) {
      if (a.kind === "judge" && a.judgeName === edit.judgeName) {
        for (const replName of edit.caseAssignments) {
          out.push({ kind: "judge", judgeName: replName });
        }
      } else {
        out.push(a);
      }
    }
    c.assertions = out;
  }
};

const applyRenameJudge = (plan: AssertionPlan, edit: RenameJudgeEdit): void => {
  const idx = requireJudgeIndex(plan, edit.judgeName);
  if (typeof edit.newName !== "string" || !JUDGE_NAME_RE.test(edit.newName)) {
    throw new PlanEditError(
      `rename-judge: new name "${edit.newName}" must be PascalCase ending in "Judge"`,
    );
  }
  if (edit.newName === edit.judgeName) {
    throw new PlanEditError(`rename-judge: new name equals old name "${edit.newName}" (no-op)`);
  }
  if (plan.judges.some((j) => j.name === edit.newName)) {
    throw new PlanEditError(
      `rename-judge: target name "${edit.newName}" is already declared. Use drop-judge on this one if it's redundant.`,
    );
  }
  const judge = plan.judges[idx];
  if (judge != null) judge.name = edit.newName;
  for (const c of plan.cases) {
    for (const a of c.assertions) {
      if (a.kind === "judge" && a.judgeName === edit.judgeName) {
        a.judgeName = edit.newName;
      }
    }
  }
};

const applyAddJudge = (plan: AssertionPlan, edit: AddJudgeEdit): void => {
  if (edit.judge == null || typeof edit.judge !== "object") {
    throw new PlanEditError(`add-judge needs a judge object`);
  }
  validateNewJudge(edit.judge, plan, `add-judge`);
  if (!Array.isArray(edit.caseNames) || edit.caseNames.length === 0) {
    throw new PlanEditError(`add-judge needs at least one case name to wire the new judge into`);
  }
  // Verify every case name resolves before mutating, so a typo
  // halts the edit cleanly.
  for (const name of edit.caseNames) {
    findCase(plan, name);
  }
  plan.judges.push(edit.judge);
  for (const name of edit.caseNames) {
    const c = findCase(plan, name);
    c.assertions.push({ kind: "judge", judgeName: edit.judge.name });
  }
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
