/**
 * Compose the spec-author research scope from skillet's bundled
 * references, the target skill root (if present on disk), and the
 * user's `--input` paths. When no `--input` is supplied, the CWD
 * acts as the fallback scope root so the common "I'm in my repo,
 * plan a skill about it" workflow works without flags.
 */

import { existsSync } from "node:fs";
import { buildScope, type ResearchScope } from "../agent/scope.js";
import { bundledReferencesDir } from "./references.js";

export interface AuthoringScopeInput {
  /** Target skill root. Included when it already exists on disk. */
  skillRoot: string;
  /** Absolute paths from the user's `--input` flags, if any. */
  inputPaths?: string[];
  /** CWD fallback when no `--input` was supplied. */
  cwd?: string;
}

export const buildAuthoringScope = (input: AuthoringScopeInput): ResearchScope => {
  const paths: string[] = [bundledReferencesDir()];
  if (existsSync(input.skillRoot)) paths.push(input.skillRoot);
  if (input.inputPaths != null && input.inputPaths.length > 0) {
    paths.push(...input.inputPaths);
  } else {
    paths.push(input.cwd ?? process.cwd());
  }
  return buildScope(paths);
};

/**
 * Pick a sensible default base directory for resolving relative tool
 * paths. Preference: the first user-supplied input path, then CWD.
 * (Skillet's bundled references and the target skill root are
 * accessible via absolute paths or by the agent reading the scope
 * roots — they don't need to be the default base.)
 */
export const defaultToolBase = (input: AuthoringScopeInput): string => {
  if (input.inputPaths != null && input.inputPaths.length > 0) {
    const first = input.inputPaths[0];
    if (first != null && first !== "") return first;
  }
  return input.cwd ?? process.cwd();
};
