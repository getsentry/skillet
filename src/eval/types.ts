/**
 * Eval result types. Re-exports the JSON / session / message /
 * usage shapes from `vitest-evals/types.ts` (the canonical source
 * for those, mirroring upstream vitest-evals#41) and adds
 * skillet's per-run / per-case shapes on top.
 */

export type {
  JsonPrimitive,
  JsonValue,
  NormalizedMessage,
  NormalizedSession,
  ToolCallRecord,
  UsageSummary,
} from "../vitest-evals/types.js";

import type { NormalizedSession, UsageSummary } from "../vitest-evals/types.js";

// ── Judge ─────────────────────────────────────────────────

export interface JudgeResultNormalized {
  grade: string;
  score: number;
  reasoning: string;
}

// ── Error ─────────────────────────────────────────────────

export interface ErrorRecord {
  type: string;
  message: string;
}

// ── Per-case result ───────────────────────────────────────

export type CaseStatus = "pass" | "fail" | "skip" | "error";

export interface EvalCaseResult {
  name: string;
  file: string;
  status: CaseStatus;
  duration: number;
  session: NormalizedSession;
  usage: UsageSummary;
  judge?: JudgeResultNormalized;
  errors: ErrorRecord[];
  /** Why it was skipped (only when status is "skip") */
  skipReason?: string;
  /**
   * ID of the spec behavior or must_not this case tested, when known.
   * Comes from the case's `behavior(...)` call inside the test body
   * (which writes `task.meta.tests_behavior`). Used by `verifyResults`
   * to map case outcomes back to spec entries.
   */
  tests_behavior?: string;
}

// ── Run-level result ──────────────────────────────────────

export interface EvalRunResult {
  cases: EvalCaseResult[];
  summary: {
    total: number;
    pass: number;
    fail: number;
    skip: number;
    error: number;
    durationMs: number;
  };
}
