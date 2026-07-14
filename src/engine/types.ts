import type { SandboxConfig } from "../harness/sandbox.js";
import type { ResolvedHarness } from "../harness/types.js";
import type { EvalCase } from "../evals/case.js";
import type { TrialResult } from "../evals/results.js";

/**
 * Everything one generated eval file needs, JSON-embedded at compile
 * time — the vitest worker process shares no memory with the CLI, so
 * this must stay plain serializable data.
 */
export interface WorkerCase {
  evalCase: EvalCase;
  harness: ResolvedHarness;
  sandbox?: SandboxConfig;
  skillRoot: string;
  /** Effective trial count (--trials already applied). */
  trials: number;
  baseline: boolean;
  keepWorkspaces: boolean;
}

export type Variant = "skill" | "baseline";

/** What each vitest test records in task.meta for the orchestrator. */
export interface TrialMeta {
  id: string;
  behavior: string;
  variant: Variant;
  trial: number;
  result: TrialResult;
}

/** Key under which the worker records the TrialMeta in task.meta. */
export const META_KEY = "skillet";
