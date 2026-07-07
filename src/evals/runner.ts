import { runJudge } from "../harness/judge.js";
import { installSkill } from "../harness/install.js";
import { runHarness } from "../harness/run.js";
import type { ResolvedHarness } from "../harness/types.js";
import type { EvalCase } from "./case.js";
import type { CheckResult } from "./checks.js";
import { runDeterministicCheck } from "./checks.js";
import type { CaseResult, TrialResult } from "./results.js";
import { SetupError, createWorkspace } from "./workspace.js";

export interface RunOptions {
  skillRoot: string;
  harness: ResolvedHarness;
  /** Overrides each case's own trials when set (--trials). */
  trials?: number;
  baseline?: boolean;
  keepWorkspaces?: boolean;
  onProgress?: (message: string) => void;
}

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
  withSkill: boolean,
): Promise<TrialResult> => {
  let workspace;
  try {
    workspace = createWorkspace({
      skillRoot: opts.skillRoot,
      ...(evalCase.fixture != null && { fixture: evalCase.fixture }),
      ...(evalCase.setup != null && { setup: evalCase.setup }),
    });
  } catch (err) {
    if (err instanceof SetupError) return errorTrial(err.message);
    throw err;
  }

  const installation = withSkill
    ? installSkill(opts.harness, opts.skillRoot, workspace.dir)
    : { cleanup: (): void => {} };

  try {
    const run = await runHarness(opts.harness, workspace.dir, evalCase.prompt, evalCase.timeout);
    if (run.timedOut) {
      return {
        status: "error",
        checks: [],
        transcript: run.transcript,
        durationMs: run.durationMs,
        error: `harness timed out after ${evalCase.timeout}s`,
      };
    }

    const deterministic = evalCase.checks.filter((c) => c.kind !== "judge");
    const judges = evalCase.checks.filter((c) => c.kind === "judge");
    const checkResults: CheckResult[] = deterministic.map((c) =>
      runDeterministicCheck(c, workspace.dir),
    );
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
      );
      checkResults.push({
        kind: "judge",
        value: judgeCheck.value,
        status: verdict.status,
        output: verdict.reasoning,
      });
    }

    const hasError = checkResults.some((c) => c.status === "error");
    const allPass = checkResults.every((c) => c.status === "pass");
    return {
      status: hasError ? "error" : allPass ? "pass" : "fail",
      checks: checkResults,
      transcript: run.transcript,
      durationMs: run.durationMs,
    };
  } catch (err) {
    return errorTrial(err instanceof Error ? err.message : String(err));
  } finally {
    installation.cleanup();
    if (opts.keepWorkspaces === true) {
      opts.onProgress?.(`workspace kept: ${workspace.dir}`);
    } else {
      workspace.cleanup();
    }
  }
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
      trials.push(await runTrial(evalCase, opts, true));
      if (opts.baseline === true) {
        opts.onProgress?.(`${evalCase.id}: baseline trial ${i + 1}/${trialCount}`);
        baselineTrials.push(await runTrial(evalCase, opts, false));
      }
    }

    results.push({
      id: evalCase.id,
      behavior: evalCase.behavior,
      trials,
      ...(opts.baseline === true && { baselineTrials }),
    });
  }
  return results;
};
