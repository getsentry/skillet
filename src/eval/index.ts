/**
 * Public API boundary for the eval engine.
 *
 * Skillet's eval execution uses vitest under the hood. Generated
 * `.eval.ts` files import from `@sentry/skillet/evals`; vitest runs
 * them via `runVitestEvals`, which spawns vitest with skillet's
 * config and parses the JSON reporter output back into `EvalRunResult`.
 *
 * External consumers (commands, authoring loop, verify) import from
 * this module only.
 */

// Vitest runner adapter
export { runVitestEvals, type RunVitestEvalsOptions } from "./vitest-runner.js";

// Discovery (used by the verify layer to locate eval files and
// extract `tests_behavior` metadata via regex scan)
export {
  discoverEvalTsFiles,
  extractCasesFromEvalTs,
  discoverAndExtract,
  type DiscoveredCase,
  type DiscoveredEvalFile,
} from "./discovery.js";

// Types (vitest-evals-compatible shapes)
export type {
  JsonPrimitive,
  JsonValue,
  ToolCallRecord,
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
