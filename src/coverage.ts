import type { ParsedSpec, Issue } from "./spec/types.js";

/** The slice of an eval case that optional link validation needs. */
export interface CaseRef {
  /** Path of the case file, for error messages. */
  file: string;
  behavior: string;
  fixture?: string;
}

/**
 * Validate optional eval links against the spec: unknown behavior
 * references and missing fixtures are errors. Constraint ids are
 * valid linkage keys too for suppression-style cases. Behaviors do
 * not require eval coverage.
 */
export const checkCoverage = (
  spec: ParsedSpec,
  cases: CaseRef[],
  fixtureSlugs: ReadonlySet<string>,
): Issue[] => {
  const issues: Issue[] = [];
  const behaviorIds = new Set(spec.behaviors.map((b) => b.id));
  const constraintIds = new Set(spec.constraints.map((c) => c.id));

  for (const c of cases) {
    if (!behaviorIds.has(c.behavior) && !constraintIds.has(c.behavior)) {
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

  return issues;
};
