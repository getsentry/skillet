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
 *
 * Module side-effect: registers the `toSatisfyJudge` custom matcher
 * via `expect.extend`. Importing from `@sentry/skillet/evals` is
 * sufficient to make `expect(result).toSatisfyJudge(JudgeFn)` work.
 */

import { registerJudgeMatchers } from "./judges.js";
import type { NamedJudgeFn, ToSatisfyJudgeOptions } from "./judges.js";

export type {
  BareDescribeEvalOptions,
  BaseJudgeOptions,
  DescribeEvalOptions,
  EvalIt,
  EvalSuiteBody,
  EvalTestContext,
  FixtureHarness,
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
export {
  CriterionJudge,
  judge,
  SubstringJudge,
  type JudgeBodyResult,
  type JudgeContext,
  type NamedJudgeFn,
  type ToSatisfyJudgeOptions,
} from "./judges.js";

// Register the `toSatisfyJudge` matcher on vitest's `expect`. Doing
// this at module load means any `.eval.ts` that imports from
// `@sentry/skillet/evals` gets the matcher without explicit setup.
registerJudgeMatchers();

// ── vitest matcher type augmentation ───────────────────────────────────────

/**
 * Declaration-merge `toSatisfyJudge` into vitest's `Assertion`
 * interface so eval files get type-safe access without explicit
 * `vitest.d.ts` setup. Matcher is async; vitest 3 supports awaitable
 * matchers transparently.
 */
declare module "vitest" {
  // The base `Assertion` interface in vitest is declared with
  // `<T = any>`; declaration merging requires the same generic
  // signature. Using `unknown` would land on a different overload.
  // oxlint-disable-next-line no-explicit-any
  interface Assertion<T = any> {
    toSatisfyJudge(judge: NamedJudgeFn, options?: ToSatisfyJudgeOptions): Promise<T>;
  }
}
