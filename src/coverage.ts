import type { ParsedSpec, Issue } from "./spec/types.js";

/** The slice of an eval case that coverage checking needs. */
export interface CaseRef {
  /** Path of the case file, for error messages. */
  file: string;
  behavior: string;
  fixture?: string;
}

/**
 * Cross-check spec behaviors against eval cases (skill-spec spec,
 * "Behavior-to-eval coverage"): unknown behavior refs and missing
 * fixtures are errors; uncovered behaviors are warnings. Constraint
 * ids are valid linkage keys too (suppression-style cases), but only
 * behaviors demand coverage.
 */
export const checkCoverage = (
  spec: ParsedSpec,
  cases: CaseRef[],
  fixtureSlugs: ReadonlySet<string>,
): Issue[] => {
  const issues: Issue[] = [];
  const behaviorIds = new Set(spec.behaviors.map((b) => b.id));
  const constraintIds = new Set(spec.constraints.map((c) => c.id));
  const covered = new Set<string>();

  for (const c of cases) {
    if (behaviorIds.has(c.behavior)) {
      covered.add(c.behavior);
    } else if (!constraintIds.has(c.behavior)) {
      const known = [...behaviorIds, ...constraintIds];
      issues.push({
        severity: "error",
        message: `${c.file}: references unknown behavior "${c.behavior}"`,
        hint:
          known.length > 0
            ? `Known behaviors and constraints: ${known.join(", ")}.`
            : "The spec has no behaviors yet.",
      });
    }
    if (c.fixture != null && !fixtureSlugs.has(c.fixture)) {
      issues.push({
        severity: "error",
        message: `${c.file}: references missing fixture "${c.fixture}"`,
        hint: `Create evals/fixtures/${c.fixture}/ or fix the slug.`,
      });
    }
  }

  for (const b of spec.behaviors) {
    if (!covered.has(b.id)) {
      issues.push({
        severity: "warning",
        message: `Behavior "${b.id}" has no eval case`,
        line: b.line,
        hint: `Add an evals/cases/*.yaml with "behavior: ${b.id}".`,
      });
    }
  }

  return issues;
};
