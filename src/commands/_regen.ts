/**
 * Shared "stage spec → run orchestrator → coverage" helper. Used by
 * commands that mutate `spec.yaml`: `spec init`, `spec refine`,
 * `spec import`, `add-eval`, `resume`. Centralizes the
 * withStaging + orchestrate + printCoverageReport sequence so call
 * sites don't drift.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveModels } from "../agent/provider.js";
import { orchestrate, type OrchestratorMode } from "../agents/orchestrator.js";
import { hasErrors } from "../agents/types.js";
import { withElapsed } from "../cli/progress.js";
import { specFileName, type SkillSpec, writeSpec } from "../spec/index.js";
import { withStaging } from "../staging/index.js";
import { printCoverageReport } from "./coverage-report.js";

const errorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return JSON.stringify(err);
};

export interface CommitSpecOptions {
  /** Skill directory. Caller is responsible for ensuring it exists. */
  skillRoot: string;
  /** Updated spec to write atomically. */
  spec: SkillSpec;
  /** Banner printed after staging and before regen. */
  regenLabel?: string;
  /** Suffix on the error block (e.g. "Original skill is unchanged."). */
  errorTrailer?: string;
  /** Skip the coverage report at the end. */
  skipCoverage?: boolean;
  /**
   * Orchestrator mode. `add-eval` runs only the eval-writer +
   * evals-validator pair (SKILL.md untouched); `create` and
   * `improve` run both pairs. Default: `create`.
   */
  orchestratorMode?: OrchestratorMode;
}

/**
 * Write `spec` atomically into `skillRoot`, run the orchestrator,
 * and print a coverage report. Returns 0 on success, 1 on failure
 * (caller's exit code).
 */
export const commitSpecAndRegenerate = async (opts: CommitSpecOptions): Promise<number> => {
  const models = resolveModels();
  const regenLabel = opts.regenLabel ?? "Running orchestrator (writers + validators)...";
  try {
    await withStaging(opts.skillRoot, async (stagingDir) => {
      writeSpec(join(stagingDir, specFileName()), opts.spec);
      // Carry SOURCES.md through if the live skill has one — the
      // writer agents read it for citation grounding. Spec-refine
      // and add-eval don't regenerate sources themselves.
      const liveSourcesPath = join(opts.skillRoot, "SOURCES.md");
      if (existsSync(liveSourcesPath)) {
        writeFileSync(
          join(stagingDir, "SOURCES.md"),
          readFileSync(liveSourcesPath, "utf-8"),
          "utf-8",
        );
      }
      console.log(`✓ Staged ${specFileName()}`);
      console.log(regenLabel);
      const orchestratorResult = await orchestrate({
        skillRoot: stagingDir,
        mode: opts.orchestratorMode ?? "create",
        model: models.agent,
        onProgress: withElapsed((msg) => {
          console.log(`  ${msg}`);
        }),
      });
      if (hasErrors(orchestratorResult.diagnostics.skill)) {
        console.error("  skill-validator returned errors; staged output preserved for inspection.");
      }
      if (hasErrors(orchestratorResult.diagnostics.evals)) {
        console.error("  evals-validator returned errors; staged output preserved for inspection.");
      }
    });
  } catch (err: unknown) {
    console.error(`Error during regeneration: ${errorMessage(err)}`);
    if (opts.errorTrailer != null) {
      console.error(opts.errorTrailer);
    }
    return 1;
  }

  if (opts.skipCoverage !== true) {
    printCoverageReport(opts.skillRoot);
  }
  return 0;
};
