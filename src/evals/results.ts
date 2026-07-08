import type { CheckResult } from "./checks.js";

export type TrialStatus = "pass" | "fail" | "error";

interface TrialBase {
  checks: CheckResult[];
  transcript: string;
  durationMs: number;
  /** Set when --keep-workspaces preserved the trial's directory. */
  workspace?: string;
}

/** Errored trials always say why (setup failure, timeout, errored check). */
export type TrialResult = TrialBase &
  ({ status: "pass" | "fail" } | { status: "error"; error: string });

export interface CaseResult {
  id: string;
  behavior: string;
  trials: TrialResult[];
  baselineTrials?: TrialResult[];
}

export interface BehaviorSummary {
  behavior: string;
  cases: number;
  trials: number;
  passed: number;
  passRate: number;
  baselineTrials?: number;
  baselinePassed?: number;
  baselinePassRate?: number;
  /** passRate − baselinePassRate: the improvement the skill itself provides. */
  lift?: number;
}

/** Fraction of trials that passed (errors count against). */
export const passRate = (trials: TrialResult[]): number => {
  if (trials.length === 0) return 0;
  return trials.filter((t) => t.status === "pass").length / trials.length;
};

/** Group case results per behavior and compute pass rates and lift. */
export const summarizeByBehavior = (results: CaseResult[]): BehaviorSummary[] => {
  const byBehavior = new Map<string, CaseResult[]>();
  for (const result of results) {
    const bucket = byBehavior.get(result.behavior) ?? [];
    bucket.push(result);
    byBehavior.set(result.behavior, bucket);
  }

  return [...byBehavior.entries()].map(([behavior, group]) => {
    const trials = group.flatMap((c) => c.trials);
    const passed = trials.filter((t) => t.status === "pass").length;
    const summary: BehaviorSummary = {
      behavior,
      cases: group.length,
      trials: trials.length,
      passed,
      passRate: trials.length > 0 ? passed / trials.length : 0,
    };
    const baseline = group.flatMap((c) => c.baselineTrials ?? []);
    if (baseline.length > 0) {
      const baselinePassed = baseline.filter((t) => t.status === "pass").length;
      summary.baselineTrials = baseline.length;
      summary.baselinePassed = baselinePassed;
      summary.baselinePassRate = baselinePassed / baseline.length;
      summary.lift = summary.passRate - summary.baselinePassRate;
    }
    return summary;
  });
};
