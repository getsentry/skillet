/**
 * Public surface for generated `.eval.ts` files.
 *
 * Generated files import from `@sentry/skillet/evals` and pick up:
 * - `describeEval` and types — from the local mini-lib
 *   (`src/vitest-evals/`) until vitest-evals 0.9 ships, then from
 *   the published package
 * - `skilletHarness` — wraps skillet's agent loop
 * - Default judges — `CriterionJudge`, `SubstringJudge`
 *
 * When vitest-evals 0.9 ships, swap the inner imports here and
 * delete `src/vitest-evals/`. Generated eval files don't change.
 */

export {
  describeEval,
  toolCalls,
  CriterionJudge,
  SubstringJudge,
} from "./vitest-evals/index.js";

export type {
  BaseJudgeOptions,
  DescribeEvalOptions,
  Harness,
  HarnessCase,
  HarnessContext,
  HarnessEvalContext,
  HarnessRun,
  JsonValue,
  JudgeFn,
  JudgeResult,
  NormalizedMessage,
  NormalizedSession,
  ToolCallRecord,
} from "./vitest-evals/index.js";

export { skilletHarness, type SkilletHarnessOptions } from "./harness/index.js";
