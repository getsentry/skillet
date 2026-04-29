/**
 * Vitest-based eval runner. Spawns `vitest run --reporter=json`
 * against a skill's evals/ directory and parses the output into
 * skillet's `EvalRunResult` shape.
 *
 * Replaces the custom YAML runner. The `EvalRunResult` shape is
 * preserved so downstream consumers (verifyResults, the improve
 * loop) don't need to change.
 */

import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  EvalCaseResult,
  EvalRunResult,
  NormalizedSession,
  UsageSummary,
} from "./types.js";

export interface RunVitestEvalsOptions {
  /** Skill root (the directory containing SKILL.md and evals/). */
  skillRoot: string;
  /** Called once per case as results stream in. Vitest doesn't expose
   *  per-case streaming via JSON reporter; this fires after the run. */
  onCaseComplete?: (result: EvalCaseResult) => void;
}

interface VitestAssertionMeta {
  harness?: {
    name?: string;
    run?: {
      session?: NormalizedSession;
      output?: unknown;
      usage?: UsageSummary;
      errors?: Array<Record<string, unknown>>;
    };
  };
  eval?: {
    scores?: Array<{ name?: string; score?: number | null; metadata?: Record<string, unknown> }>;
    avgScore?: number;
    output?: unknown;
    thresholdFailed?: boolean;
  };
  tests_behavior?: string;
}

interface VitestAssertionResult {
  fullName: string;
  title: string;
  status: "passed" | "failed" | "pending" | "skipped" | "todo";
  duration?: number;
  failureMessages?: string[];
  meta?: VitestAssertionMeta;
}

interface VitestTestFile {
  name: string;
  status: string;
  startTime?: number;
  endTime?: number;
  assertionResults: VitestAssertionResult[];
}

interface VitestJsonReport {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  startTime: number;
  success: boolean;
  testResults: VitestTestFile[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => {
  return v != null && typeof v === "object" && !Array.isArray(v);
};

const SKILLET_VITEST_CONFIG = `import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.eval.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    reporters: ["json"],
  },
});
`;

/**
 * Resolve the skillet package root by walking up from this module's
 * location looking for a `package.json` named `@sentry/skillet`. Used
 * to spawn vitest from a directory where the `vitest` package and
 * its peers are installed.
 *
 * Works whether skillet runs as a bundled CLI (dist/cli.js) or as the
 * unbundled lib (dist/lib/eval/vitest-runner.js). The CLI is bundled
 * so `import.meta.url` may point at the bundle root rather than the
 * source path — walking up tolerates either.
 */
const skilletRoot = (): string => {
  const here = fileURLToPath(import.meta.url);
  let dir = dirname(here);
  for (let i = 0; i < 8; i++) {
    const pkg = join(dir, "package.json");
    if (existsSync(pkg)) {
      try {
        const parsed = JSON.parse(readFileSync(pkg, "utf-8")) as { name?: string };
        if (parsed.name === "@sentry/skillet") return dir;
      } catch {
        // unreadable package.json — keep walking
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    "vitest-runner: could not locate skillet package root (no @sentry/skillet package.json above this module)",
  );
};

/**
 * Run all eval files in a skill's evals/ directory via vitest.
 * Returns a normalized `EvalRunResult` regardless of pass/fail.
 */
export const runVitestEvals = async (
  opts: RunVitestEvalsOptions,
): Promise<EvalRunResult> => {
  const skillRoot = resolvePath(opts.skillRoot);
  const evalsDir = join(skillRoot, "evals");

  // Vitest must run from a directory that has access to the `vitest`
  // package (and skillet's other deps). Put the transient config and
  // output file inside a `.skillet-tmp/` dir at skillet's repo root.
  const tmpRoot = join(skilletRoot(), ".skillet-tmp");
  mkdirSync(tmpRoot, { recursive: true });
  const configDir = mkdtempSync(join(tmpRoot, "vitest-"));
  const configPath = join(configDir, "vitest.config.mjs");
  writeFileSync(configPath, SKILLET_VITEST_CONFIG, "utf-8");

  const outputPath = join(configDir, "results.json");
  const args = [
    "vitest",
    "run",
    "--config",
    configPath,
    "--reporter=json",
    "--outputFile",
    outputPath,
    "--no-coverage",
    evalsDir,
  ];

  const start = Date.now();
  await new Promise<void>((resolve) => {
    const proc = spawn("npx", args, {
      cwd: skilletRoot(),
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });
    // Drain stdio; vitest writes the JSON to outputFile.
    proc.stdout.on("data", () => {});
    proc.stderr.on("data", () => {});
    proc.on("close", () => {
      resolve();
    });
  });

  let report: VitestJsonReport;
  try {
    const raw = readFileSync(outputPath, "utf-8");
    report = JSON.parse(raw) as VitestJsonReport;
  } catch (err: unknown) {
    rmSync(configDir, { recursive: true, force: true });
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`vitest produced no parseable JSON output: ${msg}`);
  }
  rmSync(configDir, { recursive: true, force: true });

  const cases: EvalCaseResult[] = [];
  for (const file of report.testResults) {
    for (const assertion of file.assertionResults) {
      const caseResult = assertionToCaseResult(file.name, assertion);
      cases.push(caseResult);
      opts.onCaseComplete?.(caseResult);
    }
  }

  const durationMs = Date.now() - start;
  return {
    cases,
    summary: {
      total: cases.length,
      pass: cases.filter((c) => c.status === "pass").length,
      fail: cases.filter((c) => c.status === "fail").length,
      skip: cases.filter((c) => c.status === "skip").length,
      error: cases.filter((c) => c.status === "error").length,
      durationMs,
    },
  };
};

const assertionToCaseResult = (
  filePath: string,
  assertion: VitestAssertionResult,
): EvalCaseResult => {
  const meta = assertion.meta ?? {};
  const harnessRun = meta.harness?.run;

  let session: NormalizedSession;
  if (harnessRun?.session != null) {
    session = harnessRun.session;
  } else {
    session = { messages: [] };
  }

  const usage: UsageSummary = harnessRun?.usage ?? {};

  const status =
    assertion.status === "passed"
      ? "pass"
      : assertion.status === "failed"
        ? "fail"
        : assertion.status === "skipped" || assertion.status === "pending"
          ? "skip"
          : "error";

  const errors: Array<{ type: string; message: string }> = [];
  for (const m of assertion.failureMessages ?? []) {
    errors.push({ type: "AssertionError", message: m });
  }

  // Convert judge scores to skillet's JudgeResultNormalized shape.
  // We pick the criterion judge if present, else the first non-trivial
  // score, so verify-results gets a meaningful number.
  const scores = meta.eval?.scores ?? [];
  const primaryScore = scores.find((s) => s.name === "CriterionJudge") ?? scores[0];
  let judge: { grade: string; score: number; reasoning: string } | undefined;
  if (primaryScore != null && primaryScore.score != null) {
    const md = isRecord(primaryScore.metadata) ? primaryScore.metadata : {};
    judge = {
      grade: typeof md.grade === "string" ? md.grade : scoreToGrade(primaryScore.score),
      score: primaryScore.score,
      reasoning: typeof md.rationale === "string" ? md.rationale : "",
    };
  }

  const result: EvalCaseResult = {
    name: assertion.title,
    file: filePath,
    status,
    duration: assertion.duration ?? 0,
    session,
    usage,
    checks: [],
    errors,
  };
  if (judge != null) result.judge = judge;
  if (typeof meta.tests_behavior === "string") {
    result.tests_behavior = meta.tests_behavior;
  }
  return result;
};

const scoreToGrade = (score: number): string => {
  if (score >= 0.95) return "A";
  if (score >= 0.7) return "B";
  if (score >= 0.45) return "C";
  if (score >= 0.2) return "D";
  return "E";
};
