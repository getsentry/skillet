/**
 * Orchestrator-driven authoring entry. Same I/O contract as the
 * legacy `authorSkill()` in `src/authoring/loop.ts`, but the
 * regenerate + improve loop is replaced by:
 *
 *   spec-author (interactive, unchanged) → orchestrator(create)
 *
 * for create mode, and
 *
 *   orchestrator(improve)  →  vitest  →  if fail: orchestrator(improve, failingEvals)
 *
 * for improve mode.
 *
 * Gated behind `SKILLET_ORCHESTRATOR=1` until Phase 6 cutover —
 * `src/commands/{create,improve,add-eval}.ts` dispatch on the env
 * var and call this entry instead of `authorSkill()`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveModels } from "../agent/provider.js";
import { withElapsed } from "../cli/progress.js";
import { createInteractiveSession } from "../cli/transport.js";
import { runVitestEvals } from "../eval/vitest-runner.js";
import { readSpec, specFileName, writeSpec, type SkillSpec } from "../spec/index.js";
import { withStaging } from "../staging/index.js";
import { runSpecAuthor } from "../authoring/phases/spec-author.js";
import { buildAuthoringScope } from "../authoring/scope.js";
import { seedFromDescription, seedFromSkill } from "../authoring/seed/index.js";
import { orchestrate, type OrchestratorResult } from "./orchestrator.js";
import { hasErrors } from "./types.js";

export interface AuthorViaOrchestratorOptions {
  mode: "create" | "improve";
  description?: string;
  /** Path to skill directory. */
  path: string;
  /**
   * Allowed-tools value to seed into the spec's frontmatter_extras
   * (create mode only).
   */
  allowedTools?: string;
  /** Absolute paths the spec-author agent may read from. */
  inputPaths?: string[];
  /** Skip vitest after the orchestrator pass (improve mode only). */
  skipEvalRun?: boolean;
}

export interface AuthorViaOrchestratorResult {
  skillRoot: string;
  /** Was the orchestrator's final state success (no error-level diagnostics)? */
  success: boolean;
  orchestratorResult?: OrchestratorResult;
}

/**
 * Drive an orchestrator-based authoring cycle. Mode-dispatch
 * inside; common shape for `create` and `improve`.
 */
export const authorSkillViaOrchestrator = async (
  opts: AuthorViaOrchestratorOptions,
): Promise<AuthorViaOrchestratorResult> => {
  if (opts.mode === "create") return runCreate(opts);
  return runImprove(opts);
};

// ── create ────────────────────────────────────────────────

const runCreate = async (
  opts: AuthorViaOrchestratorOptions,
): Promise<AuthorViaOrchestratorResult> => {
  if (opts.description == null || opts.description === "") {
    throw new Error("Description is required for create mode");
  }
  const specPath = join(opts.path, specFileName());
  if (existsSync(specPath)) {
    throw new Error(`spec.yaml already exists at ${specPath} — use 'skillet improve' instead`);
  }

  const models = resolveModels();

  console.log("Seeding draft spec from description...");
  const baseline = await seedFromDescription(models.agent, opts.description);
  if (opts.allowedTools != null) {
    baseline.frontmatter_extras = {
      ...baseline.frontmatter_extras,
      "allowed-tools": opts.allowedTools,
    };
  }

  console.log("Entering spec-author loop. Answer any questions to refine the spec.");
  const session = createInteractiveSession();
  const scope = buildAuthoringScope({
    skillRoot: opts.path,
    ...(opts.inputPaths != null ? { inputPaths: opts.inputPaths } : {}),
  });
  let spec: SkillSpec;
  let sources: string | undefined;
  try {
    const authorResult = await runSpecAuthor({
      model: models.agent,
      baseline,
      scope,
      transport: session.transport,
    });
    if (!authorResult.accepted) {
      throw new Error(
        `spec-author loop ended without user acceptance after ${authorResult.turns} turn(s). Re-run when ready.`,
      );
    }
    spec = authorResult.spec;
    sources = authorResult.sources;
  } finally {
    session.close();
  }

  // Stage spec.yaml + orchestrator outputs together so a writer
  // failure can't leave a half-mutated skill behind.
  console.log("Running orchestrator (skill-writer + eval-writer + validators)...");
  mkdirSync(opts.path, { recursive: true });
  let orchestratorResult: OrchestratorResult | undefined;
  await withStaging(opts.path, async (stagingDir) => {
    writeSpec(join(stagingDir, specFileName()), spec);
    console.log(`  Staged ${specFileName()}`);
    if (sources != null) {
      writeFileSync(join(stagingDir, "SOURCES.md"), sources, "utf-8");
      console.log("  Staged SOURCES.md");
    }
    orchestratorResult = await orchestrate({
      skillRoot: stagingDir,
      mode: "create",
      model: models.agent,
      onProgress: withElapsed((m) => console.log(`  ${m}`)),
    });
    if (orchestratorResult == null || !orchestratorResult.success) {
      // Surface findings on failure but keep the staged output —
      // user can inspect and re-run improve to patch.
      logFinalDiagnostics(orchestratorResult);
    }
  });

  return {
    skillRoot: opts.path,
    success: orchestratorResult?.success ?? false,
    ...(orchestratorResult != null ? { orchestratorResult } : {}),
  };
};

// ── improve ───────────────────────────────────────────────

const runImprove = async (
  opts: AuthorViaOrchestratorOptions,
): Promise<AuthorViaOrchestratorResult> => {
  const specPath = join(opts.path, specFileName());
  if (!existsSync(specPath)) {
    // Auto-import legacy skill (SKILL.md without spec.yaml).
    const skillMdPath = join(opts.path, "SKILL.md");
    if (!existsSync(skillMdPath)) {
      throw new Error(
        `No spec.yaml or SKILL.md at ${opts.path} — use 'skillet create' to start a new skill`,
      );
    }
    console.log("No spec.yaml found — seeding from existing SKILL.md...");
    const models = resolveModels();
    const skillMd = readFileSync(skillMdPath, "utf-8");
    const baseline = await seedFromSkill(models.agent, skillMd);
    console.log("Entering spec-author loop on imported draft.");
    const session = createInteractiveSession();
    const scope = buildAuthoringScope({
      skillRoot: opts.path,
      ...(opts.inputPaths != null ? { inputPaths: opts.inputPaths } : {}),
    });
    try {
      const authorResult = await runSpecAuthor({
        model: models.agent,
        baseline,
        scope,
        transport: session.transport,
      });
      if (!authorResult.accepted) {
        throw new Error(
          `spec-author loop ended without user acceptance after ${authorResult.turns} turn(s). Re-run when ready.`,
        );
      }
      writeSpec(specPath, authorResult.spec);
      if (authorResult.sources != null) {
        writeFileSync(join(opts.path, "SOURCES.md"), authorResult.sources, "utf-8");
        console.log("Imported spec.yaml + SOURCES.md committed.");
      } else {
        console.log("Imported spec.yaml committed.");
      }
    } finally {
      session.close();
    }
  }

  const spec = readSpec(specPath);
  if (spec == null) {
    throw new Error(`Failed to parse ${specPath} after import`);
  }
  const existingSourcesPath = join(opts.path, "SOURCES.md");
  const existingSources = existsSync(existingSourcesPath)
    ? readFileSync(existingSourcesPath, "utf-8")
    : undefined;

  const models = resolveModels();

  // Render any spec changes first.
  console.log("Running orchestrator (re-render from spec)...");
  let orchestratorResult: OrchestratorResult | undefined;
  await withStaging(opts.path, async (stagingDir) => {
    // Copy spec.yaml into staging so the writer agents see it as
    // canonical input. Other artifacts (SKILL.md, evals/) get
    // regenerated by the orchestrator into staging.
    writeSpec(join(stagingDir, specFileName()), spec);
    if (existingSources != null) {
      writeFileSync(join(stagingDir, "SOURCES.md"), existingSources, "utf-8");
    }
    orchestratorResult = await orchestrate({
      skillRoot: stagingDir,
      mode: "improve",
      model: models.agent,
      onProgress: withElapsed((m) => console.log(`  ${m}`)),
    });
  });

  if (opts.skipEvalRun === true) {
    return {
      skillRoot: opts.path,
      success: orchestratorResult?.success ?? false,
      ...(orchestratorResult != null ? { orchestratorResult } : {}),
    };
  }

  // Run vitest after the render. If failures, run the orchestrator
  // once more with failing-eval context — that's the eval-pass-driven
  // improve loop, rewired through the orchestrator.
  console.log("Running evals (vitest)...");
  const evalResult = await runVitestEvals({
    skillRoot: opts.path,
    streamProgress: true,
  });
  console.log(
    `  Eval results: ${evalResult.summary.pass}/${evalResult.summary.total} cases passed`,
  );

  const failedCount = evalResult.summary.fail + evalResult.summary.error;
  if (failedCount > 0) {
    console.log(`  ${failedCount} failures — running orchestrator with failing-eval context...`);
    await withStaging(opts.path, async (stagingDir) => {
      writeSpec(join(stagingDir, specFileName()), spec);
      if (existingSources != null) {
        writeFileSync(join(stagingDir, "SOURCES.md"), existingSources, "utf-8");
      }
      orchestratorResult = await orchestrate({
        skillRoot: stagingDir,
        mode: "improve",
        model: models.agent,
        failingEvals: evalResult,
        onProgress: withElapsed((m) => console.log(`  ${m}`)),
      });
    });
  }

  return {
    skillRoot: opts.path,
    success: (orchestratorResult?.success ?? false) && failedCount === 0,
    ...(orchestratorResult != null ? { orchestratorResult } : {}),
  };
};

const logFinalDiagnostics = (result: OrchestratorResult | undefined): void => {
  if (result == null) return;
  for (const [label, diag] of [
    ["skill-validator", result.diagnostics.skill],
    ["evals-validator", result.diagnostics.evals],
  ] as const) {
    if (!hasErrors(diag) && diag.findings.length === 0) continue;
    console.log(`\n  ${label} findings (${diag.findings.length}):`);
    for (const f of diag.findings) {
      console.log(`    [${f.severity}] ${f.subject} — ${f.kind}: ${f.message}`);
      if (f.suggestion != null) console.log(`      → ${f.suggestion}`);
    }
  }
};
