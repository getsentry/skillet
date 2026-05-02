/**
 * Public surface for generated `.eval.ts` files.
 *
 * Generated files import from `@sentry/skillet/evals` and pick up:
 * - `describeEval`, `judge`, `toolCalls` — harness-first eval API
 *   from the local mini-lib (`src/vitest-evals/`) until upstream
 *   vitest-evals ships the equivalent, then from the published
 *   package
 * - `skilletHarness` — wraps skillet's agent loop
 * - The `toSatisfyJudge` matcher (registered on `expect` at import)
 */

export { describeEval, judge, toolCalls } from "./vitest-evals/index.js";

export type {
  BareDescribeEvalOptions,
  EvalIt,
  EvalSuiteBody,
  EvalTestContext,
  FixtureHarness,
  Harness,
  HarnessCase,
  HarnessContext,
  HarnessRun,
  JsonValue,
  JudgeBodyResult,
  JudgeContext,
  NamedJudgeFn,
  NormalizedMessage,
  NormalizedSession,
  ToolCallRecord,
  ToSatisfyJudgeOptions,
} from "./vitest-evals/index.js";

export { skilletHarness, type SkilletHarnessOptions } from "./harness/index.js";
