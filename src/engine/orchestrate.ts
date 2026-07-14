import type { Reporter, TestCase } from "vitest/node";
import type { EvalCase } from "../evals/case.js";
import type { CaseResult, TrialResult } from "../evals/results.js";
import { compileCases, resolveWorkerUrl } from "./compile.js";
import { META_KEY, type TrialMeta, type WorkerCase } from "./types.js";

export interface EngineOptions {
  onProgress?: (message: string) => void;
  /** Fires as each case finishes, so results can be persisted incrementally. */
  onCaseDone?: (result: CaseResult) => void;
  /** Write a Vitest JSON report artifact here (--report). */
  reportFile?: string;
}

interface PendingCase {
  evalCase: EvalCase;
  baseline: boolean;
  expected: number;
  trials: (TrialResult | undefined)[];
  baselineTrials: (TrialResult | undefined)[];
  seen: number;
  done: boolean;
}

const errorTrial = (message: string): TrialResult => ({
  status: "error",
  checks: [],
  transcript: "",
  durationMs: 0,
  error: message,
});

/** A test that died without recording meta still yields a trial result. */
const fallbackMeta = (pending: PendingCase, testName: string, errors: string): TrialMeta | null => {
  const baseline = testName.includes("[baseline]");
  const trialMatch = /\(trial (\d+)\)/.exec(testName);
  const trial = trialMatch?.[1] != null ? Number(trialMatch[1]) - 1 : 0;
  if (baseline && !pending.baseline) return null;
  return {
    id: pending.evalCase.id,
    behavior: pending.evalCase.behavior,
    variant: baseline ? "baseline" : "skill",
    trial,
    result: errorTrial(errors === "" ? "test finished without recording a result" : errors),
  };
};

const finalize = (pending: PendingCase): CaseResult => ({
  id: pending.evalCase.id,
  behavior: pending.evalCase.behavior,
  trials: pending.trials.map((t) => t ?? errorTrial("trial never ran")),
  ...(pending.baseline && {
    baselineTrials: pending.baselineTrials.map((t) => t ?? errorTrial("trial never ran")),
  }),
});

/**
 * Run compiled cases through Vitest's programmatic API. Serial file
 * execution (design D5) keeps agent-CLI load and progress ordering
 * identical to the pre-engine runner; each test records a TrialMeta
 * which this reporter reassembles into skillet CaseResults.
 */
export const runEngine = async (
  workerCases: WorkerCase[],
  opts: EngineOptions = {},
): Promise<CaseResult[]> => {
  const compiled = compileCases(workerCases, resolveWorkerUrl());

  const pendings = new Map<string, PendingCase>();
  for (const wc of workerCases) {
    pendings.set(wc.evalCase.id, {
      evalCase: wc.evalCase,
      baseline: wc.baseline,
      expected: wc.trials * (wc.baseline ? 2 : 1),
      trials: Array.from({ length: wc.trials }),
      baselineTrials: Array.from({ length: wc.baseline ? wc.trials : 0 }),
      seen: 0,
      done: false,
    });
  }

  // Reported in file order = case id order (one generated file per case).
  const finished: CaseResult[] = [];

  const absorb = (meta: TrialMeta): void => {
    const pending = pendings.get(meta.id);
    if (pending == null || pending.done) return;
    const slot = meta.variant === "skill" ? pending.trials : pending.baselineTrials;
    if (meta.trial < 0 || meta.trial >= slot.length || slot[meta.trial] != null) return;
    slot[meta.trial] = meta.result;
    pending.seen += 1;
    if (pending.seen >= pending.expected) {
      pending.done = true;
      const result = finalize(pending);
      finished.push(result);
      opts.onCaseDone?.(result);
    }
  };

  const { startVitest } = await import("vitest/node");

  const reporter: Reporter = {
    onTestCaseReady(testCase: TestCase): void {
      opts.onProgress?.(`${testCase.name}: running`);
    },
    onTestCaseResult(testCase: TestCase): void {
      const meta = (testCase.meta() as Record<string, unknown>)[META_KEY] as TrialMeta | undefined;
      if (meta != null) {
        absorb(meta);
        return;
      }
      // Import failure, thrown setup, vitest-level timeout: synthesize.
      const caseId = [...pendings.keys()].find(
        (id) => testCase.name === id || testCase.name.startsWith(`${id} `),
      );
      const pending = caseId != null ? pendings.get(caseId) : undefined;
      if (pending == null) return;
      const errors = (testCase.result().errors ?? [])
        .map((e) => e.message ?? "")
        .join("\n")
        .slice(0, 2000);
      const synthesized = fallbackMeta(pending, testCase.name, errors);
      if (synthesized != null) absorb(synthesized);
    },
  };

  try {
    const vitest = await startVitest(
      "test",
      [],
      {
        run: true,
        // Never pick up a vitest config from the skill or repo — the
        // engine is self-contained (eval-engine spec).
        config: false,
        root: compiled.dir,
        include: ["**/*.eval.mjs"],
        reporters:
          opts.reportFile != null
            ? [reporter, ["json", { outputFile: opts.reportFile }]]
            : [reporter],
        fileParallelism: false,
        // The worker owns real timeouts (per-case harness timeout);
        // vitest's own test timeout must never fire first.
        testTimeout: 0,
        hookTimeout: 120_000,
        // Agent CLIs are heavyweight; one worker matches the old
        // serial runner's machine load.
        maxWorkers: 1,
      },
      undefined,
      // Vitest chatter (e.g. the json reporter's "JSON report written"
      // line) must never touch stdout — that would corrupt the --json
      // contract (cli spec, "JSON output convention").
      { stdout: process.stderr, stderr: process.stderr },
    );
    await vitest.close();
  } finally {
    compiled.cleanup();
  }

  // Cases whose file crashed before any test ran still get results.
  for (const pending of pendings.values()) {
    if (pending.done) continue;
    pending.done = true;
    const result = finalize(pending);
    finished.push(result);
    opts.onCaseDone?.(result);
  }

  return finished;
};
