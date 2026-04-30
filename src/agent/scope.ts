/**
 * Research scope: a set of absolute root directories that bound where
 * spec-author tools may read. The scope is composed at session start
 * (bundled references + target skill root + user `--input` paths,
 * with CWD as fallback when no `--input` was given) and threaded
 * through every tool call.
 *
 * Scope enforcement happens by wrapping the executor: the wrapper
 * resolves the path argument to an absolute path and rejects any
 * call whose target falls outside the union of scope roots. The
 * underlying executor (in `tools.ts`) stays scope-agnostic.
 */

import { realpathSync } from "node:fs";
import { resolve } from "node:path";

export interface ResearchScope {
  /** Absolute, normalized root paths the agent may read under. */
  roots: string[];
}

/**
 * Build a scope from a list of (possibly relative) input paths plus
 * any always-included roots. Each path is resolved and, when it
 * exists on disk, canonicalized with realpath so symlink games
 * cannot escape the scope.
 */
export const buildScope = (paths: string[]): ResearchScope => {
  const seen = new Set<string>();
  const roots: string[] = [];
  for (const raw of paths) {
    if (raw === "") continue;
    const absolute = resolve(raw);
    let canonical: string;
    try {
      canonical = realpathSync(absolute);
    } catch {
      // Path doesn't exist (or permission denied) — keep the resolved
      // form anyway so out-of-scope checks still work for missing
      // user-supplied inputs. The tool itself will report "file not
      // found" if the agent reads under it.
      canonical = absolute;
    }
    if (!seen.has(canonical)) {
      seen.add(canonical);
      roots.push(canonical);
    }
  }
  return { roots };
};

/**
 * Check whether `target` (an absolute path) lies inside any of the
 * scope's roots. Uses prefix matching with a `/` boundary so
 * `/a/b` does not match a sibling `/a/bc`.
 */
export const isInScope = (scope: ResearchScope, target: string): boolean => {
  const normalized = resolve(target);
  let canonical: string;
  try {
    canonical = realpathSync(normalized);
  } catch {
    canonical = normalized;
  }
  for (const root of scope.roots) {
    if (canonical === root) return true;
    if (canonical.startsWith(root + "/")) return true;
  }
  return false;
};

/**
 * Wrap an executor so it rejects out-of-scope path arguments before
 * the underlying tool runs. The wrapper inspects the `path` argument
 * (which all read-only tools in skillet's set accept) and resolves
 * it against `defaultBase` when the value is relative. Tools without
 * a path argument pass through unchanged.
 */
export const wrapExecutorForScope = (
  executor: (name: string, args: Record<string, unknown>) => string,
  scope: ResearchScope,
  defaultBase: string,
): ((name: string, args: Record<string, unknown>) => string) => {
  return (name, args) => {
    const rawPath = args.path;
    if (typeof rawPath === "string" && rawPath !== "") {
      const absolute = resolve(defaultBase, rawPath);
      if (!isInScope(scope, absolute)) {
        return `Error: path '${rawPath}' is outside the research scope. Allowed roots:\n${scope.roots
          .map((r) => `  - ${r}`)
          .join("\n")}`;
      }
    }
    return executor(name, args);
  };
};
