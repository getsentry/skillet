import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveModels } from "../agent/provider.js";
import { runEvals } from "../eval/index.js";
import type { EvalRunResult } from "../eval/index.js";
import { readSpec, regenerate, specFileName, writeSpec } from "../spec/index.js";
import { loadSkill } from "../skill/loader.js";
import { verifyCoverage, verifyResults } from "../verify/index.js";
import type { CoverageReport, ResultsReport } from "../verify/index.js";
import { runSkillImprove } from "./phases/skill-improve.js";
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
 * Spec-driven authoring loop. The spec is the user's source of
 * truth — improve never modifies it.
 *
 *   establish spec (init / import / load)
 *     ↓
 *   regenerate SKILL.md + evals from spec
 *     ↓
 *   run evals
 *     ↓
 *   promote passing LLM-generated cases back into the spec
 *     ↓
 *   verify per-behavior coverage + results
 *     ↓                                 ↓
 *  pass: terminate              fail: tune SKILL.md prose only
 *                                       (spec untouched)
 *                                       ↓
 *                                  re-run evals
 *                                       ↓
 *                                  loop
 *
 * Spec changes belong to user-initiated commands (`spec refine`,
 * `add-eval`, hand-edits). The improve loop refines the rendering
 * of fixed rules, never the rules themselves.
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
    console.log(`  Wrote ${specPath} (faithful capture; loop will tune prose to fit)`);
  }

  // ── Phase 2: Initial regen from spec ────────────────────
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
  let exitReason: "max-iterations" | "timeout" | "no-improvement" = "max-iterations";

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    if (Date.now() - loopStart > totalTimeout) {
      console.log(`\nTotal timeout reached (${(totalTimeout / 1000).toFixed(0)}s). Stopping.`);
      exitReason = "timeout";
      break;
    }

    const elapsed = ((Date.now() - loopStart) / 1000).toFixed(0);
    console.log(`\nIteration ${iteration}/${maxIterations} (${elapsed}s elapsed)`);

    const spec = readSpec(specPath);
    if (spec == null) {
      throw new Error(`spec.yaml disappeared between iterations at ${specPath}`);
    }

    // Coverage check — improve cannot add behaviors, so any coverage
    // gap here means the eval-gen LLM dropped one. Surface it but
    // don't try to fix it ourselves; the user runs `add-eval` or
    // hand-edits the spec to fill the hole.
    const coverage = verifyCoverage(spec, skillPath);
    lastCoverage = coverage;
    if (!coverage.ok && coverage.uncovered.length > 0) {
      console.log(
        `  Coverage gap: ${coverage.uncovered.length} uncovered. Improve can't add behaviors — run \`skillet add-eval\` or edit spec.yaml.`,
      );
    }

    // Run evals.
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

    lastResults = verifyResults(spec, lastEvalResult);
    const passing = lastResults.behaviors.filter((b) => b.status === "covered+passing").length;
    console.log(`  Per-behavior: ${passing}/${lastResults.behaviors.length} behaviors passing`);

    // Termination: every behavior has a passing case AND no orphan cases.
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

    if (iteration === maxIterations) break;

    // ── Tune SKILL.md prose only ─────────────────────────
    // Spec is read-only here — the rule set is fixed, we only
    // re-render it with failure context as guidance.
    console.log("  Tuning SKILL.md prose against failures...");
    const skillMdPath = join(skillPath, "SKILL.md");
    const currentSkillMd = readFileSync(skillMdPath, "utf-8");
    const newSkillMd = await runSkillImprove(
      models.agent,
      spec,
      currentSkillMd,
      lastEvalResult,
    );

    if (newSkillMd === currentSkillMd) {
      console.log("  Prose unchanged — assessor produced no improvements. Terminating.");
      exitReason = "no-improvement";
      break;
    }

    writeFileSync(skillMdPath, newSkillMd, "utf-8");
    console.log("  SKILL.md updated; spec and eval YAMLs unchanged.");
  }

  const totalElapsed = ((Date.now() - loopStart) / 1000).toFixed(0);
  const exitLines: Record<typeof exitReason, string> = {
    "max-iterations": `Max iterations reached. (${totalElapsed}s total)`,
    timeout: `Timeout reached. (${totalElapsed}s total)`,
    "no-improvement": `Loop terminated: assessor produced no SKILL.md changes. (${totalElapsed}s total)`,
  };
  console.log(`\n${exitLines[exitReason]}`);

  if (lastResults != null) {
    const failing = lastResults.behaviors.filter((b) => b.status !== "covered+passing");
    if (failing.length > 0) {
      console.log("Behaviors still failing:");
      for (const v of failing) {
        console.log(`  - ${v.kind}:${v.id} → ${v.status}`);
      }
      console.log(
        '\nIf the rules need tightening, run `skillet spec refine "<feedback>"` or edit spec.yaml directly.',
      );
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
