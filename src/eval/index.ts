/**
 * Public API boundary for the eval engine.
 *
 * All external consumers (commands, authoring loop, tests) should import
 * from this module only — never from internal eval modules directly.
 *
 * This boundary is the future swap point for vitest-evals integration.
 */

// Runner
export { runEvals, type RunEvalOptions } from "./runner.js";

// Types (vitest-evals-compatible shapes)
export type {
  JsonPrimitive,
  JsonValue,
  NormalizedMessage,
  NormalizedSession,
  UsageSummary,
  CheckResultNormalized,
  JudgeResultNormalized,
  ErrorRecord,
  CaseStatus,
  EvalCaseResult,
  EvalRunResult,
} from "./types.js";

// Parser (for validation and eval discovery)
export {
  discoverEvalFiles,
  parseEvalFile,
  isWorkspaceCheck,
  isOutputContains,
  isOutputNotContains,
  isOutputMatches,
  type EvalFile,
  type EvalCase,
  type Check,
  type WorkspaceCheck,
  type OutputContainsCheck,
} from "./parser.js";

// Linter (for validating generated eval YAML)
export { lintEvalYaml, type LintResult, type LintFix, type LintError } from "./linter.js";
