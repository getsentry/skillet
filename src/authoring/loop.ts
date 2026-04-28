import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveModels } from "../agent/provider.js";
import { runEvals } from "../eval/index.js";
import type { EvalRunResult } from "../eval/index.js";
import {
  applyPatches,
  readSpec,
  regenerate,
  specFileName,
  validateSpecObject,
  writeSpec,
  type SkillSpec,
} from "../spec/index.js";
import { loadSkill } from "../skill/loader.js";
import { verifyCoverage, verifyResults } from "../verify/index.js";
import type { CoverageReport, ResultsReport } from "../verify/index.js";
import { runAssess } from "./phases/assess.js";
import { runSpecImport } from "./phases/spec-import.js";
import { runSpecInit } from "./phases/spec-init.js";

// ── Types ─────────────────────────────────────────────────

export type AuthorMode = "create" | "improve";

export interface AuthorSkillOptions {
  mode: AuthorMode;
  /** Natural-language description (required for create, ignored for improve) */
  description?: string;
  /** Path to skill directory */
  path: string;
  /** Maximum iterations (default: 3) */
  maxIterations?: number;
  /** Total timeout in ms for the entire authoring loop (default: 5 minutes) */
  totalTimeout?: number;
}

export interface AuthorSkillResult {
  skillRoot: string;
  iterations: number;
  finalEvalResult?: EvalRunResult;
  finalCoverage?: CoverageReport;
  finalResults?: ResultsReport;
  success: boolean;
}

// ── Orchestrator ──────────────────────────────────────────

const DEFAULT_MAX_ITERATIONS = 3;
const DEFAULT_TOTAL_TIMEOUT = 5 * 60 * 1000; // 5 minutes

/**
 * Spec-driven authoring loop:
 *
 *   establish spec (init / import / load)
 *     ↓
 *   regenerate SKILL.md + evals
 *     ↓
 *   verify coverage (structural)         ──► fails: feed gaps to assess
 *     ↓
 *   run evals
 *     ↓
 *   verify results (per-behavior)        ──► fails: feed verdicts to assess
 *     ↓
 *   assess → SpecPatch[]                 ──► [] terminates loop
 *     ↓
 *   apply patches → regenerate
 *     ↓
 *   loop until verifyResults.ok or max iterations
 *
 * Termination is conditioned on `verifyResults.ok` rather than raw
 * `summary.fail === 0` so missing-coverage failures are caught.
 */
export const authorSkill = async (opts: AuthorSkillOptions): Promise<AuthorSkillResult> => {
  const { mode, path: skillPath, description } = opts;
  const maxIterations = opts.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const totalTimeout = opts.totalTimeout ?? DEFAULT_TOTAL_TIMEOUT;

  const models = resolveModels();
  const specPath = join(skillPath, specFileName());

  // ── Phase 1: Establish spec ─────────────────────────────
  const existingSpec = existsSync(specPath) ? readSpec(specPath) : null;

  if (mode === "create") {
    if (description == null || description === "") {
      throw new Error("Description is required for create mode");
    }
    if (existingSpec != null) {
      throw new Error(`spec.yaml already exists at ${specPath} — use 'skillet improve' instead`);
    }
    console.log("Generating spec from description...");
    const spec = await runSpecInit(models.agent, description);
    mkdirSync(skillPath, { recursive: true });
    writeSpec(specPath, spec);
    console.log(`  Wrote ${specPath}`);
  } else if (existingSpec == null) {
    // Improve mode without a spec — auto-import from SKILL.md
    const skillMdPath = join(skillPath, "SKILL.md");
    if (!existsSync(skillMdPath)) {
      throw new Error(
        `No SKILL.md or spec.yaml at ${skillPath} — use 'skillet create' to start a new skill`,
      );
    }
    console.log("No spec.yaml found — importing from existing SKILL.md...");
    const skillMd = readFileSync(skillMdPath, "utf-8");
    const spec = await runSpecImport(models.agent, skillMd);
    mkdirSync(skillPath, { recursive: true });
    writeSpec(specPath, spec);
    console.log(`  Wrote ${specPath} (faithful capture; loop will refine)`);
  }

  // ── Phase 2: Initial regen ──────────────────────────────
  console.log("Regenerating SKILL.md and evals from spec...");
  await regenerate(skillPath, {
    model: models.agent,
    onProgress: (msg) => {
      console.log(`  ${msg}`);
    },
  });

  // ── Phase 3: Iteration loop ─────────────────────────────
  const loopStart = Date.now();
  let lastEvalResult: EvalRunResult | undefined;
  let lastCoverage: CoverageReport | undefined;
  let lastResults: ResultsReport | undefined;
  let exitReason:
    | "max-iterations"
    | "timeout"
    | "patch-failed"
    | "no-patches"
    | "validation-failed" = "max-iterations";
  let exitDetail = "";

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    if (Date.now() - loopStart > totalTimeout) {
      console.log(`\nTotal timeout reached (${(totalTimeout / 1000).toFixed(0)}s). Stopping.`);
      exitReason = "timeout";
      break;
    }

    const elapsed = ((Date.now() - loopStart) / 1000).toFixed(0);
    console.log(`\nIteration ${iteration}/${maxIterations} (${elapsed}s elapsed)`);

    // Reload spec each iteration since patches may have rewritten it.
    const spec = readSpec(specPath);
    if (spec == null) {
      throw new Error(`spec.yaml disappeared between iterations at ${specPath}`);
    }

    // Layer-2 verify: coverage gaps surface here before we spend tokens
    // running evals on a partially-generated suite.
    const coverage = verifyCoverage(spec, skillPath);
    lastCoverage = coverage;
    if (!coverage.ok) {
      console.log(
        `  Coverage gap: ${coverage.uncovered.length} uncovered, ${coverage.orphans.length} orphan(s)`,
      );
    }

    // Run evals only if coverage is at least partial (i.e. there's
    // something to run). Even with gaps we run, because failing cases
    // also produce signal — but on a totally-empty suite, skip.
    let coverageOnlyIteration = false;
    if (coverage.covered.length === 0 && coverage.uncovered.length > 0) {
      console.log("  No covered behaviors yet — skipping eval run, going straight to assess");
      coverageOnlyIteration = true;
    } else {
      console.log("  Running evals...");
      const skill = loadSkill(skillPath);
      let currentCase = "";
      let caseStart = Date.now();
      lastEvalResult = await runEvals({
        skill,
        agentModel: models.agent,
        judgeModel: models.judge,
        onCaseComplete: (result) => {
          const caseDuration = ((Date.now() - caseStart) / 1000).toFixed(1);
          const icon = result.status === "pass" ? "✓" : result.status === "fail" ? "✗" : "○";
          console.log(`    ${icon} ${result.name}  ${caseDuration}s`);
          caseStart = Date.now();
        },
        onToolCall: (caseName, toolName, step) => {
          if (caseName !== currentCase) {
            currentCase = caseName;
            console.log(`    ▸ ${caseName}`);
          }
          process.stderr.write(`\u001B[2m      step ${step}: ${toolName}\u001B[0m\n`);
        },
      });

      const { summary } = lastEvalResult;
      console.log(`  Eval results: ${summary.pass}/${summary.total} cases passed`);

      // Layer-3 verify: per-behavior pass/fail.
      lastResults = verifyResults(spec, lastEvalResult);
      const passing = lastResults.behaviors.filter((b) => b.status === "covered+passing").length;
      console.log(`  Per-behavior: ${passing}/${lastResults.behaviors.length} behaviors passing`);

      // Loop terminates only when both coverage and per-behavior
      // results are clean. Raw eval pass/fail is not enough — a skill
      // with passing cases but uncovered behaviors isn't done.
      if (coverage.ok && lastResults.ok) {
        console.log("\nAll behaviors covered and passing.");
        return {
          skillRoot: skillPath,
          iterations: iteration,
          finalEvalResult: lastEvalResult,
          finalCoverage: coverage,
          finalResults: lastResults,
          success: true,
        };
      }
    }

    // Last iteration — don't assess, just report.
    if (iteration === maxIterations) break;

    // ── Assess + patch + regen ───────────────────────────
    console.log("  Assessing failures...");
    const assessRunResult = lastEvalResult ?? emptyEvalRunResult();
    const patches = await runAssess(models.agent, spec, coverage, lastResults, assessRunResult);

    if (patches.length === 0) {
      console.log("  Assessor produced no patches — terminating.");
      exitReason = "no-patches";
      break;
    }

    console.log(`  Applying ${patches.length} patch${patches.length === 1 ? "" : "es"}...`);
    let updated: SkillSpec;
    try {
      updated = applyPatches(spec, patches);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  Patch application failed: ${msg}`);
      exitReason = "patch-failed";
      exitDetail = msg;
      break;
    }

    const validation = validateSpecObject(updated, specPath);
    if (!validation.valid) {
      console.log("  Patched spec failed structural validation:");
      for (const e of validation.errors) console.log(`    ${e.message}`);
      exitReason = "validation-failed";
      exitDetail = validation.errors.map((e) => e.message).join("; ");
      break;
    }

    writeSpec(specPath, updated);

    console.log("  Regenerating from patched spec...");
    await regenerate(skillPath, {
      model: models.agent,
      onProgress: (msg) => {
        console.log(`    ${msg}`);
      },
    });

    // The patched-spec iteration ran without evals. Make sure we don't
    // claim success on stale data — set a marker that the next loop
    // iteration runs evals fresh.
    if (coverageOnlyIteration) {
      lastEvalResult = undefined;
      lastResults = undefined;
    }
  }

  const totalElapsed = ((Date.now() - loopStart) / 1000).toFixed(0);
  const exitLines: Record<typeof exitReason, string> = {
    "max-iterations": `Max iterations reached. (${totalElapsed}s total)`,
    timeout: `Timeout reached. (${totalElapsed}s total)`,
    "patch-failed": `Loop aborted: assessor produced an invalid patch. (${totalElapsed}s total)`,
    "no-patches": `Loop terminated: assessor produced no patches. (${totalElapsed}s total)`,
    "validation-failed": `Loop aborted: patched spec failed structural validation. (${totalElapsed}s total)`,
  };
  console.log(`\n${exitLines[exitReason]}`);
  if (exitDetail !== "") {
    console.log(`  Detail: ${exitDetail}`);
  }
  if (lastResults != null) {
    const failing = lastResults.behaviors.filter((b) => b.status !== "covered+passing");
    if (failing.length > 0) {
      console.log("Behaviors still failing:");
      for (const v of failing) {
        console.log(`  - ${v.kind}:${v.id} → ${v.status}`);
      }
    }
  }

  const result: AuthorSkillResult = {
    skillRoot: skillPath,
    iterations: maxIterations,
    success: false,
  };
  if (lastEvalResult != null) result.finalEvalResult = lastEvalResult;
  if (lastCoverage != null) result.finalCoverage = lastCoverage;
  if (lastResults != null) result.finalResults = lastResults;
  return result;
};

const emptyEvalRunResult = (): EvalRunResult => ({
  cases: [],
  summary: { total: 0, pass: 0, fail: 0, skip: 0, error: 0, durationMs: 0 },
});
