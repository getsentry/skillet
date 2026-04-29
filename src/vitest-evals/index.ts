/**
 * Local mini-lib that mirrors the harness-first vitest-evals API
 * (getsentry/vitest-evals#41). Generated `.eval.ts` files import from
 * `@sentry/skillet/evals`, which re-exports this module plus the
 * skillet harness adapter.
 *
 * When vitest-evals 0.9 (with the harness-first API) ships, this
 * module is replaced by re-exports from the real package — the
 * `@sentry/skillet/evals` import path stays the same, so generated
 * eval files don't need to change.
 */

export type {
  BaseJudgeOptions,
  DescribeEvalOptions,
  Harness,
  HarnessCase,
  HarnessCaseSource,
  HarnessContext,
  HarnessEvalContext,
  HarnessRun,
  JsonPrimitive,
  JsonValue,
  JudgeFn,
  JudgeResult,
  NormalizedMessage,
  NormalizedSession,
  TimingSummary,
  ToolCallRecord,
  UsageSummary,
} from "./types.js";

export { describeEval, toolCalls } from "./describe-eval.js";
export { CriterionJudge, SubstringJudge } from "./judges.js";
