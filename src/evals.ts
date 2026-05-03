/**
 * Public surface for generated `.eval.ts` files.
 *
 * Generated files import everything they need from
 * `@sentry/skillet/evals`. The barrel re-exports upstream's
 * `vitest-evals` and `@vitest-evals/harness-pi-ai` verbatim,
 * and adds skillet-specific helpers:
 *
 * - `skilletAgent({ skillRoot })` — skillet skill as a pi-ai
 *   agent. Returns `{ run, tools }`; pass to
 *   `piAiHarness({ agent })`. The harness auto-detects the
 *   toolset off `.tools`, so eval files don't pass `tools`
 *   separately.
 * - `criterionJudge(name, text)` — single-criterion LLM judge
 *   built on upstream `namedJudge`.
 * - `createWorkspace(skillRoot, slug?)` — per-test tempdir
 *   helper that optionally seeds from
 *   `evals/fixtures/<slug>/` and registers cleanup via vitest's
 *   `onTestFinished`.
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

export {
  piAiHarness,
  type PiAiRuntime,
  type PiAiToolDefinition,
  type PiAiToolset,
} from "@vitest-evals/harness-pi-ai";

export { criterionJudge } from "./evals/criterion-judge.js";
export { createWorkspace } from "./evals/with-workspace.js";
export {
  skilletAgent,
  type SkilletAgent,
  type SkilletAgentOptions,
} from "./evals/skillet-agent.js";
