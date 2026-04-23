import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve the references/ directory.
 *
 * Works both from source (development: references/ at project root)
 * and from an installed npm package (references/ at package root).
 */
const resolveReferencesDir = (): string => {
  // __dirname equivalent for ESM
  const thisFile = fileURLToPath(import.meta.url);
  const srcDir = dirname(thisFile); // src/authoring/
  const projectRoot = join(srcDir, "..", ".."); // project root
  return join(projectRoot, "references");
};

const referencesDir = resolveReferencesDir();

const loadReference = (filename: string): string => {
  return readFileSync(join(referencesDir, filename), "utf-8");
};

export const loadSkillPatterns = (): string => loadReference("skill-patterns.md");

export const loadAuthoringGuidance = (): string => loadReference("authoring-guidance.md");

export const loadEvalExamples = (): string => loadReference("eval-examples.md");

/**
 * Load all reference material concatenated, for use in system prompts.
 */
export const loadAllReferences = (): string => {
  return [loadSkillPatterns(), loadAuthoringGuidance(), loadEvalExamples()].join("\n\n---\n\n");
};
