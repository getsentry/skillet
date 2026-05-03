/**
 * Public surface for generated `.eval.ts` files.
 *
 * Generated files import everything they need from
 * `@sentry/skillet/evals`. The barrel re-exports upstream's
 * `vitest-evals` and `@vitest-evals/harness-pi-ai` verbatim,
 * and adds skillet-specific helpers:
 *
 * - `skilletAgent({ skillRoot })` — pi-ai agent that loads
 *   the skill and drives the LLM-call-with-tools loop.
 * - `skilletTools()` — `PiAiToolset` with the agent's tools
 *   (Bash, Read, Write, Edit, Glob, Grep). File-writing tools
 *   call `ctx.setArtifact(path, content)` so artifacts surface
 *   on `HarnessRun.artifacts`.
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
export { skilletTools, type SkilletToolsOptions } from "./evals/skillet-tools.js";
