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
  CriterionJudge,
  describeEval,
  judge,
  SubstringJudge,
  toolCalls,
} from "./vitest-evals/index.js";

export type {
  BareDescribeEvalOptions,
  BaseJudgeOptions,
  DescribeEvalOptions,
  EvalIt,
  EvalSuiteBody,
  EvalTestContext,
  Harness,
  HarnessCase,
  HarnessContext,
  HarnessEvalContext,
  HarnessRun,
  JsonValue,
  JudgeBodyResult,
  JudgeContext,
  JudgeFn,
  JudgeResult,
  NamedJudgeFn,
  NormalizedMessage,
  NormalizedSession,
  ToolCallRecord,
  ToSatisfyJudgeOptions,
} from "./vitest-evals/index.js";

export { skilletHarness, type SkilletHarnessOptions } from "./harness/index.js";
