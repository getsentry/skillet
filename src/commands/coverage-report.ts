import { existsSync } from "node:fs";
import { join } from "node:path";
import { readSpec, specFileName } from "../spec/index.js";
import { verifyCoverage } from "../verify/index.js";

/**
 * Print a one-line coverage status after any spec-mutating command.
 *
 * Surfaces the case where a mutation completed cleanly but the spec
 * is now in a half-finished state — e.g. `add-eval` auto-imported
 * 20 behaviors, dedupe found the user's input was redundant, but
 * the imported behaviors have no eval blocks. Without this report,
 * the user has no signal that `improve` is now needed.
 *
 * No-op when the spec doesn't exist (caller is mid-create).
 */
export const printCoverageReport = (skillRoot: string): void => {
  const specPath = join(skillRoot, specFileName());
  if (!existsSync(specPath)) return;
  const spec = readSpec(specPath);
  if (spec == null) return;

  const total = spec.behaviors.length + spec.must_not.length;
  if (total === 0) return;

  const report = verifyCoverage(spec, skillRoot);
  const covered = report.covered.length;
  const uncovered = report.uncovered.length;
  const orphans = report.orphans.length;

  if (uncovered === 0 && orphans === 0) {
    console.log(`Coverage: ${covered}/${total} behaviors have eval cases.`);
    return;
  }

  const parts: string[] = [`Coverage: ${covered}/${total} behaviors have eval cases`];
  if (uncovered > 0) parts.push(`${uncovered} uncovered`);
  if (orphans > 0) parts.push(`${orphans} orphan case${orphans === 1 ? "" : "s"}`);
  console.log(parts.join(" — ") + ".");
  if (uncovered > 0) {
    console.log("Run `skillet improve` to generate eval cases for the uncovered behaviors.");
  }
  if (orphans > 0) {
    console.log("Orphan eval cases reference behavior IDs that don't exist in spec.yaml.");
  }
};
