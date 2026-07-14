/**
 * Runs inside vitest worker processes only — cli.js never imports
 * this. Generated eval files (compile.ts) call registerCase with an
 * embedded WorkerCase; each trial becomes a vitest test whose harness
 * spawns the agent CLI in a fresh workspace (no API keys anywhere —
 * the CLI carries its own auth) and whose checks are native expect
 * assertions. Judge checks go through vitest-evals' judge pipeline
 * with skillet's grading prompt and verdict parsing unchanged.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect } from "vitest";
import {
  createHarness,
  createJudge,
  createJudgeHarness,
  describeEval,
  runJudgeHarness,
  type JudgeHarness,
} from "vitest-evals";
import { buildJudgePrompt, describeWorkspace, parseVerdict } from "../harness/judge.js";
import { installSkill } from "../harness/install.js";
import { runHarness } from "../harness/run.js";
import type { Check } from "../evals/case.js";
import { type CheckResult, runCheck } from "../evals/checks.js";
import type { TrialResult } from "../evals/results.js";
import { SetupError, createWorkspace } from "../evals/workspace.js";
import { META_KEY, type TrialMeta, type Variant, type WorkerCase } from "./types.js";

/** Error prefix shared by the message and the retry check keyed on it. */
const HARNESS_EXIT_PREFIX = "harness exited with code";

const JUDGE_TIMEOUT_SECONDS = 120;

/**
 * Type alias (not interface) so it satisfies vitest-evals' JsonValue
 * bound — interfaces lack the implicit index signature the bound needs.
 */
// oxlint-disable-next-line typescript-eslint/consistent-type-definitions
type TrialOutput = {
  workspaceDir: string;
  transcript: string;
  durationMs: number;
  /** Harness-level failure (setup, timeout, nonzero exit) — checks skipped. */
  error?: string;
};

/** Workspace/staging teardown deferred to afterAll so checks and judges see the workspace. */
const cleanups: (() => void)[] = [];

const attempt = async (cfg: WorkerCase, variant: Variant, prompt: string): Promise<TrialOutput> => {
  let workspace;
  try {
    workspace = createWorkspace({
      skillRoot: cfg.skillRoot,
      ...(cfg.evalCase.fixture != null && { fixture: cfg.evalCase.fixture }),
      ...(cfg.evalCase.setup != null && { setup: cfg.evalCase.setup }),
    });
  } catch (error) {
    if (error instanceof SetupError) {
      return { workspaceDir: "", transcript: "", durationMs: 0, error: error.message };
    }
    throw error;
  }
  if (!cfg.keepWorkspaces) cleanups.push(workspace.cleanup);

  const installation =
    variant === "skill"
      ? installSkill(cfg.harness, cfg.skillRoot, workspace.dir)
      : { cleanup: (): void => {} };
  cleanups.push(installation.cleanup);

  const run = await runHarness(
    cfg.harness,
    workspace.dir,
    prompt,
    cfg.evalCase.timeout,
    cfg.sandbox,
  );
  if (run.timedOut) {
    return {
      workspaceDir: workspace.dir,
      transcript: run.transcript,
      durationMs: run.durationMs,
      error: `harness timed out after ${cfg.evalCase.timeout}s`,
    };
  }
  if (run.exitCode !== 0) {
    // The agent CLI died (auth, network, startup) — checks would
    // grade an empty run as a skill failure, so this is an error.
    return {
      workspaceDir: workspace.dir,
      transcript: run.transcript,
      durationMs: run.durationMs,
      error: `${HARNESS_EXIT_PREFIX} ${run.exitCode}: ${run.transcript.trim().slice(-200)}`,
    };
  }
  return { workspaceDir: workspace.dir, transcript: run.transcript, durationMs: run.durationMs };
};

/**
 * The agent-under-test harness: spawn the CLI in a fresh workspace.
 * Startup failures (nonzero exit before any agent work) are transient
 * often enough that one automatic retry is the right default.
 */
const trialHarness = (cfg: WorkerCase, variant: Variant) =>
  createHarness<string, TrialOutput>({
    name: variant === "skill" ? cfg.harness.name : `${cfg.harness.name} (baseline)`,
    run: async ({ input }) => {
      let out = await attempt(cfg, variant, input);
      if (out.error?.startsWith(HARNESS_EXIT_PREFIX) === true) {
        out = await attempt(cfg, variant, input);
      }
      return {
        events: [
          { type: "message", role: "user", content: input },
          {
            type: "message",
            role: "assistant",
            content: out.transcript === "" ? (out.error ?? "(no output)") : out.transcript,
          },
        ],
        output: out,
        usage: {},
      };
    },
  });

/**
 * The judge harness spawns the same agent CLI with the grading prompt
 * in a directory isolated from the eval workspace (judge spec).
 */
const judgeHarnessFor = (cfg: WorkerCase): JudgeHarness =>
  createJudgeHarness({
    name: `${cfg.harness.name} (judge)`,
    run: async ({ prompt }) => {
      const judgeDir = mkdtempSync(join(tmpdir(), "skillet-judge-"));
      try {
        const run = await runHarness(
          cfg.harness,
          judgeDir,
          prompt,
          JUDGE_TIMEOUT_SECONDS,
          cfg.sandbox,
        );
        return run.lastMessage !== "" ? run.lastMessage : run.transcript;
      } finally {
        rmSync(judgeDir, { recursive: true, force: true });
      }
    },
  });

/**
 * One judge object for every `judge:` check; the criterion arrives as
 * a matcher option. Prompt and verdict parsing are skillet's existing
 * ones — only the plumbing (harness, scoring, reporting) is native.
 */
const CriterionJudge = createJudge<string, TrialOutput, { criterion: string }>(
  "CriterionJudge",
  async (ctx) => {
    if (ctx.runJudge == null) throw new Error("CriterionJudge requires a judgeHarness");
    const prompt = buildJudgePrompt(
      ctx.criterion,
      ctx.input,
      ctx.output.transcript,
      describeWorkspace(ctx.output.workspaceDir),
    );
    let lastText = "";
    for (let tries = 0; tries < 2; tries++) {
      const raw = await ctx.runJudge({ prompt });
      lastText = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
      const verdict = parseVerdict(lastText);
      if (verdict != null) {
        return {
          score: verdict === "pass" ? 1 : 0,
          metadata: { rationale: lastText.slice(0, 2000) },
        };
      }
    }
    throw new Error(`judge output had no VERDICT line after retry: ${lastText.slice(0, 1000)}`);
  },
);

const deterministicChecks = (cfg: WorkerCase): Check[] =>
  cfg.evalCase.checks.filter((c) => c.kind !== "judge");
const judgeChecks = (cfg: WorkerCase): Check[] =>
  cfg.evalCase.checks.filter((c) => c.kind === "judge");

const trialFrom = (
  out: TrialOutput,
  checks: CheckResult[],
  keepWorkspace: boolean,
): TrialResult => {
  const kept = keepWorkspace && out.workspaceDir !== "" ? { workspace: out.workspaceDir } : {};
  if (out.error != null) {
    return {
      status: "error",
      checks,
      transcript: out.transcript,
      durationMs: out.durationMs,
      error: out.error,
      ...kept,
    };
  }
  const errored = checks.find((c) => c.status === "error");
  if (errored != null && errored.status === "error") {
    return {
      status: "error",
      error: errored.output,
      checks,
      transcript: out.transcript,
      durationMs: out.durationMs,
      ...kept,
    };
  }
  return {
    status: checks.every((c) => c.status === "pass") ? "pass" : "fail",
    checks,
    transcript: out.transcript,
    durationMs: out.durationMs,
    ...kept,
  };
};

/**
 * Register one eval case: a describeEval suite per variant, one test
 * per trial. Skill trials assert natively (each check is a soft
 * expect, each judge a toSatisfyJudge); baseline trials only record
 * their result — they exist to measure lift, not to gate the run.
 */
export const registerCase = (cfg: WorkerCase): void => {
  const { evalCase } = cfg;
  const judgeHarness = judgeHarnessFor(cfg);

  const record = (
    task: { meta: unknown },
    variant: Variant,
    trial: number,
    result: TrialResult,
  ): void => {
    const meta: TrialMeta = {
      id: evalCase.id,
      behavior: evalCase.behavior,
      variant,
      trial,
      result,
    };
    (task.meta as Record<string, unknown>)[META_KEY] = meta;
  };

  describeEval(evalCase.id, { harness: trialHarness(cfg, "skill"), judgeHarness }, (it) => {
    for (let trial = 0; trial < cfg.trials; trial++) {
      const name = cfg.trials > 1 ? `${evalCase.id} (trial ${trial + 1})` : evalCase.id;
      it(name, async ({ run, task }) => {
        const result = await run(evalCase.prompt);
        const out = result.output;
        if (out.error != null) {
          record(task, "skill", trial, trialFrom(out, [], cfg.keepWorkspaces));
          expect.fail(out.error);
        }

        const checks: CheckResult[] = deterministicChecks(cfg).map((c) =>
          runCheck(c, out.workspaceDir),
        );
        const deterministicPassed = !checks.some((c) => c.status !== "pass");

        let judgeFailure: unknown;
        for (const jc of judgeChecks(cfg)) {
          if (!deterministicPassed || judgeFailure != null) {
            checks.push({ kind: "judge", value: jc.value, status: "skipped" });
            continue;
          }
          try {
            await expect(result).toSatisfyJudge(CriterionJudge, {
              criterion: jc.value,
              threshold: 1,
            });
            checks.push({ kind: "judge", value: jc.value, status: "pass" });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const output = message.slice(0, 2000);
            checks.push(
              message.includes("no VERDICT")
                ? { kind: "judge", value: jc.value, status: "error", output }
                : { kind: "judge", value: jc.value, status: "fail", output },
            );
            judgeFailure = error;
          }
        }

        record(task, "skill", trial, trialFrom(out, checks, cfg.keepWorkspaces));
        for (const check of checks) {
          if (check.kind === "judge") continue;
          const detail = check.status !== "pass" && check.status !== "skipped" ? check.output : "";
          expect.soft(check.status, `${check.kind}: ${check.value}\n${detail}`).toBe("pass");
        }
        if (judgeFailure != null) {
          throw judgeFailure instanceof Error ? judgeFailure : new Error(String(judgeFailure));
        }
      });
    }
  });

  if (!cfg.baseline) {
    registerCleanup();
    return;
  }

  describeEval(`${evalCase.id} [baseline]`, { harness: trialHarness(cfg, "baseline") }, (it) => {
    for (let trial = 0; trial < cfg.trials; trial++) {
      const name =
        cfg.trials > 1
          ? `${evalCase.id} [baseline] (trial ${trial + 1})`
          : `${evalCase.id} [baseline]`;
      it(name, async ({ run, task }) => {
        const result = await run(evalCase.prompt);
        const out = result.output;
        if (out.error != null) {
          record(task, "baseline", trial, trialFrom(out, [], cfg.keepWorkspaces));
          return;
        }
        const checks: CheckResult[] = deterministicChecks(cfg).map((c) =>
          runCheck(c, out.workspaceDir),
        );
        const deterministicPassed = !checks.some((c) => c.status !== "pass");
        for (const jc of judgeChecks(cfg)) {
          if (!deterministicPassed) {
            checks.push({ kind: "judge", value: jc.value, status: "skipped" });
            continue;
          }
          checks.push(await gradeBaselineJudge(judgeHarness, jc, evalCase.prompt, out));
        }
        record(task, "baseline", trial, trialFrom(out, checks, cfg.keepWorkspaces));
        // No assertions: baseline failing is expected — it is the point.
      });
    }
  });

  registerCleanup();
};

/**
 * Baseline judges bypass the matcher (a failing baseline must not
 * fail the vitest test) but run through the same judge harness.
 */
const gradeBaselineJudge = async (
  judgeHarness: JudgeHarness,
  check: Check,
  casePrompt: string,
  out: TrialOutput,
): Promise<CheckResult> => {
  const prompt = buildJudgePrompt(
    check.value,
    casePrompt,
    out.transcript,
    describeWorkspace(out.workspaceDir),
  );
  let lastText = "";
  for (let tries = 0; tries < 2; tries++) {
    const raw = await runJudgeHarness(judgeHarness, { prompt });
    lastText = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
    const verdict = parseVerdict(lastText);
    const output = lastText.slice(0, 2000);
    if (verdict === "pass") return { kind: "judge", value: check.value, status: "pass", output };
    if (verdict === "fail") return { kind: "judge", value: check.value, status: "fail", output };
  }
  return {
    kind: "judge",
    value: check.value,
    status: "error",
    output: `judge output had no VERDICT line after retry: ${lastText.slice(0, 1000)}`,
  };
};

let cleanupRegistered = false;
const registerCleanup = (): void => {
  if (cleanupRegistered) return;
  cleanupRegistered = true;
  afterAll(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
};
