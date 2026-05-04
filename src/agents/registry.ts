/**
 * Bundled-agent registry. Resolves the `agents/` directory inside
 * the npm package (or repo, in dev) and exposes accessors for the
 * four authoring agents the orchestrator drives.
 *
 * The directory structure mirrors `references/` — adjacent to
 * `dist/` in a built/installed package, two levels up from
 * `src/agents/` when running from source via tsx.
 */

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentDefinition } from "./types.js";

/**
 * The candidate directory must contain at least one bundled agent
 * subdirectory; otherwise it is the wrong `agents/` (e.g. `src/agents`
 * itself, which resolves up one level by accident in dev).
 */
const isAgentsBundleDir = (candidate: string): boolean => {
  return existsSync(candidate) && existsSync(join(candidate, "skill-writer", "SKILL.md"));
};

const resolveAgentsDir = (): string => {
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = dirname(thisFile);

  // Adjacent to dist/ (bundled CLI or installed package).
  const fromDist = join(thisDir, "..", "agents");
  if (isAgentsBundleDir(fromDist)) return fromDist;

  // Project root from src/agents/ (development with tsx).
  const fromSrc = join(thisDir, "..", "..", "agents");
  if (isAgentsBundleDir(fromSrc)) return fromSrc;

  // CWD-relative (running from project root).
  const fromCwd = join(process.cwd(), "agents");
  if (isAgentsBundleDir(fromCwd)) return fromCwd;

  throw new Error(
    `Cannot find agents/ bundle directory containing skill-writer/. Searched:\n  ${fromDist}\n  ${fromSrc}\n  ${fromCwd}`,
  );
};

const resolveBundleRoot = (name: string): string => {
  const agentsDir = resolveAgentsDir();
  const candidate = resolve(agentsDir, name);
  if (!existsSync(candidate)) {
    throw new Error(`Bundled agent "${name}" not found at ${candidate}`);
  }
  if (!existsSync(join(candidate, "SKILL.md"))) {
    throw new Error(`Bundled agent "${name}" missing SKILL.md at ${candidate}`);
  }
  return candidate;
};

export type BundledAgentName =
  | "skill-writer"
  | "eval-writer"
  | "skill-validator"
  | "evals-validator";

/** Build a writer agent definition (skill-writer or eval-writer). */
const writer = (name: BundledAgentName): AgentDefinition => ({
  name,
  bundleRoot: resolveBundleRoot(name),
  tools: { canWrite: true },
});

/** Build a validator agent definition. */
const validator = (name: BundledAgentName): AgentDefinition => ({
  name,
  bundleRoot: resolveBundleRoot(name),
  tools: { canWrite: false },
});

/**
 * Resolve a bundled agent definition by name. Lazy — does not
 * touch the filesystem until called, so importing this module
 * does not require all four bundles to exist (useful during
 * development as agents land one at a time).
 */
export const getBundledAgent = (name: BundledAgentName): AgentDefinition => {
  if (name === "skill-writer" || name === "eval-writer") return writer(name);
  return validator(name);
};
