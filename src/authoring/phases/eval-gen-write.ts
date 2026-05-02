/**
 * Per-skill render + write stage. Runs after the consolidation +
 * audit passes have produced the final `ConsolidationResult`.
 *
 * Writes (in order):
 *   1. evals/_judges.ts (one per skill, canonical judge set)
 *   2. evals/fixtures/<slug>/<rel-path> (one tree per case with a fixture)
 *   3. evals/<entry-id>.eval.ts (one per consolidated entry)
 *
 * Pure orchestration over `renderEvalFile` / `renderJudgesFile`;
 * no LLM calls. Telemetry helper lives here too so the
 * orchestrator (`runEvalGen`) only needs one call to surface
 * consolidation stats.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { event } from "../../log.js";
import type { ConsolidationResult } from "./eval-gen-consolidate.js";
import { renderEvalFile, renderJudgesFile } from "./eval-gen-render.js";

export const emitConsolidationTelemetry = (c: ConsolidationResult): void => {
  event(
    "info",
    `eval-gen-consolidate declared=${c.totalDeclared} canonical=${c.judges.length} fixtures=${Object.keys(c.fixtures).length}`,
  );
  for (const conflict of c.conflicts) {
    event("warn", `eval-gen-consolidate conflict judge=${conflict.judgeName}`, {
      criteria: conflict.criteria,
      entryIds: conflict.entryIds,
    });
  }
};

/**
 * Returns the list of `.eval.ts` paths written.
 */
export const writeArtifacts = (
  skillRoot: string,
  evalsDir: string,
  consolidation: ConsolidationResult,
  log?: (msg: string) => void,
): string[] => {
  const judgesPath = join(evalsDir, "_judges.ts");
  writeFileSync(judgesPath, renderJudgesFile(consolidation.judges), "utf-8");
  log?.(`  wrote ${judgesPath} (${consolidation.judges.length} canonical judges)`);

  for (const [caseSlug, fileMap] of Object.entries(consolidation.fixtures)) {
    writeFixtureTree(skillRoot, caseSlug, fileMap);
  }
  if (Object.keys(consolidation.fixtures).length > 0) {
    log?.(
      `  wrote ${Object.keys(consolidation.fixtures).length} fixture tree(s) under evals/fixtures/`,
    );
  }

  const written: string[] = [];
  for (const { entryId, plan } of consolidation.perEntry) {
    const filePath = join(evalsDir, `${entryId}.eval.ts`);
    const rendered = renderEvalFile(entryId, plan, consolidation.judges);
    writeFileSync(filePath, rendered, "utf-8");
    written.push(filePath);
    log?.(`  wrote ${filePath}`);
  }
  return written;
};

const writeFixtureTree = (
  skillRoot: string,
  caseSlug: string,
  files: Record<string, string>,
): void => {
  const root = join(skillRoot, "evals", "fixtures", caseSlug);
  for (const [relPath, content] of Object.entries(files)) {
    const full = join(root, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, "utf-8");
  }
};
