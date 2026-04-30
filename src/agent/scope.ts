/**
 * Research scope: a bounded set of absolute root directories the
 * spec-author agent may read under, plus the default base used to
 * resolve relative tool paths. Scope enforcement wraps the executor
 * — the wrapper canonicalizes the path argument and rejects calls
 * outside the roots. Symlink resolution closes the obvious escape.
 */

import { realpathSync } from "node:fs";
import { resolve } from "node:path";

export interface ResearchScope {
  /** Absolute, canonical root paths the agent may read under. */
  roots: string[];
  /** Base directory for resolving relative tool path arguments. */
  defaultBase: string;
}

/**
 * Build a scope from a list of (possibly relative) input paths. Each
 * is resolved and, when it exists, canonicalized via realpath so
 * symlink games cannot escape the scope. The first non-empty input
 * becomes the `defaultBase`.
 */
export const buildScope = (paths: string[]): ResearchScope => {
  const seen = new Set<string>();
  const roots: string[] = [];
  let defaultBase: string | undefined;
  for (const raw of paths) {
    if (raw === "") continue;
    const absolute = resolve(raw);
    let canonical: string;
    try {
      canonical = realpathSync(absolute);
    } catch {
      // Missing/inaccessible — keep the resolved form; tool reads will
      // surface "not found" naturally.
      canonical = absolute;
    }
    if (!seen.has(canonical)) {
      seen.add(canonical);
      roots.push(canonical);
    }
    defaultBase ??= canonical;
  }
  return { roots, defaultBase: defaultBase ?? process.cwd() };
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
 * Wrap an executor so it rejects out-of-scope path arguments. The
 * wrapper inspects the `path` argument (which read-only tools all
 * accept), resolves it against `scope.defaultBase` when relative, and
 * checks against the canonical roots. Tools without a path argument
 * pass through unchanged.
 */
export const wrapExecutorForScope = (
  executor: (name: string, args: Record<string, unknown>) => string,
  scope: ResearchScope,
): ((name: string, args: Record<string, unknown>) => string) => {
  return (name, args) => {
    const rawPath = args.path;
    if (typeof rawPath === "string" && rawPath !== "") {
      const absolute = resolve(scope.defaultBase, rawPath);
      if (!isInScope(scope, absolute)) {
        return `Error: path '${rawPath}' is outside the research scope. Allowed roots:\n${scope.roots
          .map((r) => `  - ${r}`)
          .join("\n")}`;
      }
    }
    return executor(name, args);
  };
};
