/**
 * Public API boundary for the verify module.
 *
 * Verify uses `spec.yaml` as an oracle to check that derived
 * artifacts (SKILL.md, eval YAMLs) and per-behavior eval results
 * agree with the spec. Layered: structural → cross-artifact →
 * per-behavior results → semantic (opt-in). External consumers
 * (commands, authoring loop) import from this module only.
 */

export type {
  VerifyReport,
  StructuralReport,
  StructuralIssue,
  CoverageReport,
  UncoveredEntry,
  OrphanCase,
  ResultsReport,
  BehaviorResultVerdict,
  BehaviorResultStatus,
  SemanticReport,
  SemanticBehaviorVerdict,
  SemanticVerdict,
} from "./types.js";

export { verify, type VerifyOptions } from "./runner.js";
export { verifyStructural } from "./structural.js";
export { verifyCoverage } from "./coverage.js";
export { verifyResults } from "./results.js";
export { verifySemantic } from "./semantic.js";
