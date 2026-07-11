import { runJudge } from "../harness/judge.js";
import type { SandboxConfig } from "../harness/sandbox.js";
import { installSkill } from "../harness/install.js";
import { runHarness } from "../harness/run.js";
import type { ResolvedHarness } from "../harness/types.js";
import type { Check, EvalCase } from "./case.js";
import { type CheckResult, runCheck } from "./checks.js";
import type { CaseResult, TrialResult } from "./results.js";
import { SetupError, createWorkspace } from "./workspace.js";

export interface RunOptions {
  skillRoot: string;
  harness: ResolvedHarness;
  /** Overrides each case's own trials when set (--trials). */
  trials?: number;
  /** Present wraps every harness invocation in a container. */
  sandbox?: SandboxConfig;
  baseline?: boolean;
  keepWorkspaces?: boolean;
  onProgress?: (message: string) => void;
  /** Fires as each case finishes, so results can be persisted incrementally. */
  onCaseDone?: (result: CaseResult) => void;
}

/** Error prefix shared by the message and the retry check keyed on it. */
const HARNESS_EXIT_PREFIX = "harness exited with code";

const errorTrial = (message: string): TrialResult => ({
  status: "error",
  checks: [],
  transcript: "",
  durationMs: 0,
  error: message,
});

/**
 * One trial of one case: fresh workspace, skill installed (unless a
 * baseline trial), harness run, deterministic checks, then judges —
 * judges only when every deterministic check passed (judge spec).
 */
const runTrial = async (
  evalCase: EvalCase,
  opts: RunOptions,
  variant: "skill" | "baseline",
): Promise<TrialResult> => {
  let workspace;
  try {
    workspace = createWorkspace({
      skillRoot: opts.skillRoot,
      ...(evalCase.fixture != null && { fixture: evalCase.fixture }),
      ...(evalCase.setup != null && { setup: evalCase.setup }),
    });
  } catch (error) {
    if (error instanceof SetupError) return errorTrial(error.message);
    throw error;
  }
  // Kept workspaces surface on the result so eval can print one
  // consolidated list at the end instead of scroll-away progress lines.
  const kept = opts.keepWorkspaces === true ? { workspace: workspace.dir } : {};

  const installation =
    variant === "skill"
      ? installSkill(opts.harness, opts.skillRoot, workspace.dir)
      : { cleanup: (): void => {} };

  try {
    // Heartbeat: a silent multi-minute agent run is indistinguishable
    // from a hang without it.
    let elapsed = 0;
    const heartbeat = setInterval(() => {
      elapsed += 30;
      opts.onProgress?.(`${evalCase.id}: still running (~${elapsed}s)`);
    }, 30_000);
    heartbeat.unref();
    let run;
    try {
      run = await runHarness(
        opts.harness,
        workspace.dir,
        evalCase.prompt,
        evalCase.timeout,
        opts.sandbox,
      );
    } finally {
      clearInterval(heartbeat);
    }
    if (run.timedOut) {
      return {
        status: "error",
        checks: [],
        transcript: run.transcript,
        durationMs: run.durationMs,
        error: `harness timed out after ${evalCase.timeout}s`,
        ...kept,
      };
    }
    if (run.exitCode !== 0) {
      // The agent CLI died (auth, network, startup) — checks would
      // grade an empty run as a skill failure, so this is an error.
      return {
        status: "error",
        checks: [],
        transcript: run.transcript,
        durationMs: run.durationMs,
        error: `${HARNESS_EXIT_PREFIX} ${run.exitCode}: ${run.transcript.trim().slice(-200)}`,
        ...kept,
      };
    }

    const deterministic = evalCase.checks.filter((c) => c.kind !== "judge");
    const judges = evalCase.checks.filter((c) => c.kind === "judge");
    const checkResults: CheckResult[] = deterministic.map((c) => runCheck(c, workspace.dir));
    const deterministicFailed = checkResults.some((c) => c.status !== "pass");

    for (const judgeCheck of judges) {
      if (deterministicFailed) {
        checkResults.push({ kind: "judge", value: judgeCheck.value, status: "skipped" });
        continue;
      }
      const verdict = await runJudge(
        opts.harness,
        judgeCheck.value,
        evalCase.prompt,
        run.transcript,
        workspace.dir,
        opts.sandbox,
      );
      checkResults.push({
        kind: "judge",
        value: judgeCheck.value,
        status: verdict.status,
        output: verdict.reasoning,
      });
    }

    const errored = checkResults.find((c) => c.status === "error");
    if (errored != null && errored.status === "error") {
      return {
        status: "error",
        error: errored.output,
        checks: checkResults,
        transcript: run.transcript,
        durationMs: run.durationMs,
        ...kept,
      };
    }
    return {
      status: checkResults.every((c) => c.status === "pass") ? "pass" : "fail",
      checks: checkResults,
      transcript: run.transcript,
      durationMs: run.durationMs,
      ...kept,
    };
  } catch (error) {
    return { ...errorTrial(error instanceof Error ? error.message : String(error)), ...kept };
  } finally {
    installation.cleanup();
    if (opts.keepWorkspaces !== true) {
      workspace.cleanup();
    }
  }
};

/**
 * Harness startup failures (nonzero exit before the agent did any
 * work) are transient often enough that one automatic retry is the
 * right default; a second failure surfaces as the trial's error.
 */
const runTrialWithRetry = async (
  evalCase: EvalCase,
  opts: RunOptions,
  variant: "skill" | "baseline",
): Promise<TrialResult> => {
  const first = await runTrial(evalCase, opts, variant);
  if (first.status === "error" && first.error.startsWith(HARNESS_EXIT_PREFIX)) {
    opts.onProgress?.(`${evalCase.id}: harness startup failure, retrying once`);
    return runTrial(evalCase, opts, variant);
  }
  return first;
};

export interface DryCaseResult {
  id: string;
  behavior: string;
  /** Deterministic checks that pass with no agent run (invariant guards, or bugs). */
  pristinePass: Check[];
  deterministic: number;
  /** Judge checks can't be dry-run; reported so nobody assumes they were. */
  judges: number;
  /** True when a do-nothing agent would pass this case — the eval proves nothing. */
  vacuous: boolean;
  /** Set when the workspace could not be built — the case was not dry-run. */
  error?: string;
}

/**
 * Run every deterministic check against the pristine workspace, no
 * agent involved. Individual pristine-passers are fine (invariant
 * guards like "existing files unchanged" pass by design) — the defect
 * is a case where ALL of them pass, because then a do-nothing agent
 * scores a pass.
 */
export const dryRun = (cases: EvalCase[], skillRoot: string): DryCaseResult[] => {
  const results: DryCaseResult[] = [];
  for (const evalCase of cases) {
    const deterministicCount = evalCase.checks.filter((c) => c.kind !== "judge").length;
    const judgeCount = evalCase.checks.length - deterministicCount;
    let workspace;
    try {
      workspace = createWorkspace({
        skillRoot,
        ...(evalCase.fixture != null && { fixture: evalCase.fixture }),
        ...(evalCase.setup != null && { setup: evalCase.setup }),
      });
    } catch (error) {
      if (error instanceof SetupError) {
        results.push({
          id: evalCase.id,
          behavior: evalCase.behavior,
          pristinePass: [],
          deterministic: deterministicCount,
          judges: judgeCount,
          vacuous: false,
          error: error.message,
        });
        continue;
      }
      throw error;
    }
    try {
      const deterministic = evalCase.checks.filter((c) => c.kind !== "judge");
      const pristinePass = deterministic.filter(
        (check) => runCheck(check, workspace.dir).status === "pass",
      );
      results.push({
        id: evalCase.id,
        behavior: evalCase.behavior,
        pristinePass,
        deterministic: deterministic.length,
        judges: judgeCount,
        vacuous: deterministic.length > 0 && pristinePass.length === deterministic.length,
      });
    } finally {
      workspace.cleanup();
    }
  }
  return results;
};

/** Run a list of cases through the harness, serially. */
export const runCases = async (cases: EvalCase[], opts: RunOptions): Promise<CaseResult[]> => {
  const results: CaseResult[] = [];
  for (const evalCase of cases) {
    const trialCount = opts.trials ?? evalCase.trials;
    const trials: TrialResult[] = [];
    const baselineTrials: TrialResult[] = [];

    for (let i = 0; i < trialCount; i++) {
      opts.onProgress?.(`${evalCase.id}: trial ${i + 1}/${trialCount}`);
      trials.push(await runTrialWithRetry(evalCase, opts, "skill"));
      if (opts.baseline === true) {
        opts.onProgress?.(`${evalCase.id}: baseline trial ${i + 1}/${trialCount}`);
        baselineTrials.push(await runTrialWithRetry(evalCase, opts, "baseline"));
      }
    }

    const result: CaseResult = {
      id: evalCase.id,
      behavior: evalCase.behavior,
      trials,
      ...(opts.baseline === true && { baselineTrials }),
    };
    opts.onCaseDone?.(result);
    results.push(result);
  }
  return results;
};
