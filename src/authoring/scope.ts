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

/**
 * Compose the spec-author research scope from skillet's bundled
 * references, the target skill root (when present), and the user's
 * `--input` paths. CWD is the fallback when no `--input` was given.
 *
 * The first non-bundled path becomes `scope.defaultBase` (used by
 * the scope wrapper to resolve relative tool path arguments) — this
 * favors the user's most-likely working directory over skillet's
 * bundled references.
 */
export const buildAuthoringScope = (input: AuthoringScopeInput): ResearchScope => {
  const userPaths: string[] = [];
  if (input.inputPaths != null && input.inputPaths.length > 0) {
    userPaths.push(...input.inputPaths);
  } else {
    userPaths.push(input.cwd ?? process.cwd());
  }
  // Order matters: user paths first so defaultBase is the user's
  // working dir, not skillet's bundled refs.
  const paths: string[] = [...userPaths, bundledReferencesDir()];
  if (existsSync(input.skillRoot)) paths.push(input.skillRoot);
  return buildScope(paths);
};
