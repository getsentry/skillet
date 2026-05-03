/**
 * Public surface for generated `.eval.ts` files.
 *
 * Generated files import everything they need from
 * `@sentry/skillet/evals`. The barrel re-exports the upstream
 * `vitest-evals` API verbatim and adds three skillet-specific
 * helpers:
 *
 * - `criterionJudge(name, text)` — single-criterion LLM-as-judge
 *   built on upstream's `namedJudge`.
 * - `createWorkspace(skillRoot, slug?)` — per-test tempdir helper;
 *   optionally seeds from `evals/fixtures/<slug>/` and registers
 *   cleanup via vitest's `onTestFinished`.
 * - `skilletHarness({ skill })` — the `Harness` adapter that
 *   runs skillet's agent loop.
 */

export {
  describeEval,
  namedJudge,
  toolCalls,
  type BaseJudgeOptions,
  type DescribeEvalOptions,
  type Harness,
  type HarnessContext,
  type HarnessMetadata,
  type HarnessRun,
  type JsonValue,
  type JudgeContext,
  type JudgeFn,
  type JudgeResult,
  type NormalizedMessage,
  type NormalizedSession,
  type ToolCallRecord,
} from "vitest-evals";

export { criterionJudge } from "./evals/criterion-judge.js";
export { createWorkspace } from "./evals/with-workspace.js";
export {
  skilletHarness,
  type SkilletHarnessOptions,
  type SkilletHarnessMetadata,
} from "./harness/index.js";
