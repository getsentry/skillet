import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve the references/ directory.
 *
 * The bundle (dist/cli.js) is one level down from the project root,
 * but when running from source the current file is two levels down
 * (src/authoring/). We try both paths and use whichever exists.
 *
 * For an installed npm package, references/ is at the package root
 * alongside dist/.
 */
const resolveReferencesDir = (): string => {
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = dirname(thisFile);

  // Try: adjacent to dist/ (bundled CLI or installed package)
  const fromDist = join(thisDir, "..", "references");
  if (existsSync(fromDist)) {
    return fromDist;
  }

  // Try: project root from src/authoring/ (development with tsx/ts-node)
  const fromSrc = join(thisDir, "..", "..", "references");
  if (existsSync(fromSrc)) {
    return fromSrc;
  }

  // Fallback: cwd-relative (running from project root)
  const fromCwd = join(process.cwd(), "references");
  if (existsSync(fromCwd)) {
    return fromCwd;
  }

  throw new Error(
    `Cannot find references/ directory. Searched:\n  ${fromDist}\n  ${fromSrc}\n  ${fromCwd}`,
  );
};

const referencesDir = resolveReferencesDir();

/**
 * Absolute path to skillet's bundled references directory. Exposed so
 * the spec-author scope builder can include it as a research-scope
 * root (the agent reads class guidance and other shipped material
 * via the same read_file tool it uses for user-supplied inputs).
 */
export const bundledReferencesDir = (): string => referencesDir;

const loadReference = (filename: string): string => {
  return readFileSync(join(referencesDir, filename), "utf-8");
};

export const loadSkillPatterns = (): string => loadReference("skill-patterns.md");

export const loadAuthoringGuidance = (): string => loadReference("authoring-guidance.md");

export const loadEvalExamples = (): string => loadReference("eval-examples.md");
