/**
 * Shared "stage spec → regen → coverage" helper used by every
 * command that mutates spec.yaml: `spec init`, `spec refine`,
 * `spec import`, `add-eval`, `resume`. Each call site previously
 * inlined the same withStaging + regenerate + printCoverageReport
 * sequence with subtle drift (one site dropped withElapsed; error
 * messages diverged).
 */

import { join } from "node:path";
import { resolveModels } from "../agent/provider.js";
import { orchestrate, type OrchestratorMode } from "../agents/orchestrator.js";
import { hasErrors } from "../agents/types.js";
import { withElapsed } from "../cli/progress.js";
import { specFileName, type SkillSpec, writeSpec } from "../spec/index.js";
import { regenerate } from "../spec/regen.js";
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
  /** Skip the coverage report at the end (some callers want to defer it). */
  skipCoverage?: boolean;
  /**
   * Orchestrator mode when `SKILLET_ORCHESTRATOR=1`. add-eval skips
   * the skill-writer pass; create/improve run both writers.
   * Default: "create".
   */
  orchestratorMode?: OrchestratorMode;
}

/**
 * Write `spec` atomically into `skillRoot`, regenerate derived
 * artifacts (SKILL.md, evals/), and print a coverage report.
 * Returns 0 on success, 1 on failure (caller's exit code).
 */
export const commitSpecAndRegenerate = async (opts: CommitSpecOptions): Promise<number> => {
  const models = resolveModels();
  const regenLabel = opts.regenLabel ?? "Regenerating SKILL.md and evals...";
  const useOrchestrator = process.env.SKILLET_ORCHESTRATOR === "1";
  try {
    await withStaging(opts.skillRoot, async (stagingDir) => {
      writeSpec(join(stagingDir, specFileName()), opts.spec);
      console.log(`✓ Staged ${specFileName()}`);
      console.log(regenLabel);
      if (useOrchestrator) {
        const orchestratorResult = await orchestrate({
          skillRoot: stagingDir,
          mode: opts.orchestratorMode ?? "create",
          model: models.agent,
          onProgress: withElapsed((msg) => {
            console.log(`  ${msg}`);
          }),
        });
        if (hasErrors(orchestratorResult.diagnostics.skill)) {
          console.error(
            "  skill-validator returned errors; staged output preserved for inspection.",
          );
        }
        if (hasErrors(orchestratorResult.diagnostics.evals)) {
          console.error(
            "  evals-validator returned errors; staged output preserved for inspection.",
          );
        }
      } else {
        await regenerate(stagingDir, {
          model: models.agent,
          evalGenModel: models.evalGen,
          onProgress: withElapsed((msg) => {
            console.log(`  ${msg}`);
          }),
        });
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
