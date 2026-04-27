/**
 * Types for the verify module — uses the spec as an oracle to check
 * that derived artifacts (SKILL.md, eval YAMLs) and (when run results
 * are available) per-behavior eval outcomes agree with the spec.
 *
 * Verification is layered: cheap structural checks first, more
 * expensive cross-artifact and semantic checks after. The runner
 * short-circuits on the first failing layer.
 */

// ── Layer 1: structural ───────────────────────────────────

export interface StructuralIssue {
  /** Path of the file the issue applies to (or the skill root). */
  path: string;
  /** Human-readable error message. */
  message: string;
}

export interface StructuralReport {
  ok: boolean;
  /** Errors that prevent later layers from running. */
  errors: StructuralIssue[];
}

// ── Layer 2: cross-artifact coverage ──────────────────────

/** A behavior or must_not entry that has no eval case covering it. */
export interface UncoveredEntry {
  id: string;
  kind: "behavior" | "must_not";
  statement: string;
}

/** An eval case whose `tests_behavior` does not match any spec entry. */
export interface OrphanCase {
  caseName: string;
  filePath: string;
  testsBehavior: string;
}

export interface CoverageReport {
  ok: boolean;
  /** IDs of behaviors / must_nots with at least one matching case. */
  covered: string[];
  /** Spec entries that no eval case covers. */
  uncovered: UncoveredEntry[];
  /** Eval cases referencing behavior IDs that don't exist. */
  orphans: OrphanCase[];
  /** Cross-artifact issues other than coverage (e.g. name mismatch). */
  issues: StructuralIssue[];
}

// ── Layer 3: per-behavior results ─────────────────────────

export type BehaviorResultStatus =
  | "covered+passing"
  | "covered+failing"
  | "covered+skipped"
  | "uncovered";

export interface BehaviorResultVerdict {
  id: string;
  kind: "behavior" | "must_not";
  status: BehaviorResultStatus;
  /** Names of eval cases linked to this behavior. */
  caseNames: string[];
  /** True if at least one linked case passed. */
  hasPass: boolean;
  /** True if at least one linked case failed. */
  hasFail: boolean;
  /** True if at least one linked case was skipped. */
  hasSkip: boolean;
}

export interface ResultsReport {
  ok: boolean;
  behaviors: BehaviorResultVerdict[];
}

// ── Layer 4: semantic (LLM judge, opt-in) ─────────────────

export type SemanticVerdict = "encoded" | "partial" | "missing";

export interface SemanticBehaviorVerdict {
  id: string;
  kind: "behavior" | "must_not";
  verdict: SemanticVerdict;
  reasoning: string;
}

export interface SemanticReport {
  ok: boolean;
  behaviors: SemanticBehaviorVerdict[];
}

// ── Combined report ───────────────────────────────────────

/**
 * Top-level result of `verify()`. Each layer is optional — earlier
 * layers populate first, and a failure in one layer prevents later
 * layers from running (their fields stay `undefined`).
 */
export interface VerifyReport {
  ok: boolean;
  structural: StructuralReport;
  coverage?: CoverageReport;
  results?: ResultsReport;
  semantic?: SemanticReport;
}
