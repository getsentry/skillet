/**
 * Workspace artifact capture for the harness.
 *
 * For coding skills the agent's deliverable is the file it edits or
 * creates, not its chat output. To grade those skills the judge needs
 * to see the post-run workspace, not just the transcript.
 *
 * Strategy: snapshot the workspace AFTER setup (so seeded fixtures
 * don't count as the agent's work) and again AFTER the agent runs.
 * Files that are new or changed are captured as artifacts and surfaced
 * to the judge.
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SKIP_DIRS = new Set([".git", "node_modules", ".cache", "dist", ".next", ".venv"]);

/** Files larger than this are skipped from snapshot+capture entirely. */
const SNAPSHOT_FILE_CEILING = 1_000_000; // 1 MB

/** Default per-file cap when capturing for the judge. */
const DEFAULT_MAX_BYTES_PER_FILE = 50_000;

/** Default total budget across all captured files. */
const DEFAULT_MAX_TOTAL_BYTES = 200_000;

export interface FileSnapshot {
  hash: string;
  size: number;
}

export interface CaptureOptions {
  maxBytesPerFile?: number;
  maxTotalBytes?: number;
  /**
   * When set, capture exactly these relative paths from the workspace
   * (independent of whether they're new or changed). Used by cases
   * that hint which files matter — e.g. `artifacts: ["src/user.ts"]`.
   */
  explicitPaths?: string[];
}

export interface CapturedArtifacts {
  /** Map of relative path → file content (utf-8). */
  files: Map<string, string>;
  /** Paths whose content was truncated to fit `maxBytesPerFile`. */
  truncated: string[];
  /** Paths skipped because the total budget was exhausted. */
  skipped: string[];
}

/** Cheap binary detector — looks for NUL bytes in a leading sample. */
const isLikelyText = (buf: Buffer): boolean => {
  const sample = buf.length > 8192 ? buf.subarray(0, 8192) : buf;
  for (const byte of sample) {
    if (byte === 0) return false;
  }
  return true;
};

const walk = (dir: string, root: string, out: Map<string, FileSnapshot>): void => {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true, encoding: "utf-8" });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, root, out);
      continue;
    }
    if (!entry.isFile()) continue;
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.size > SNAPSHOT_FILE_CEILING) continue;
    let buf: Buffer;
    try {
      buf = readFileSync(full);
    } catch {
      continue;
    }
    if (!isLikelyText(buf)) continue;
    const hash = createHash("sha256").update(buf).digest("hex");
    out.set(relative(root, full), { hash, size: stat.size });
  }
};

/**
 * Walk the workspace and produce a {path → hash} map of every text
 * file under the size ceiling. Skips dot-dirs, build outputs, and
 * binary files. The result is intentionally not lazy — it's read
 * once before the agent runs and once after, then compared.
 */
export const snapshotWorkspace = (dir: string): Map<string, FileSnapshot> => {
  const out = new Map<string, FileSnapshot>();
  if (!existsSync(dir)) return out;
  walk(dir, dir, out);
  return out;
};

/**
 * Compare a pre-run snapshot against the live workspace and return
 * the contents of files that are new or modified. When `explicitPaths`
 * is provided, that overrides the auto-detection — the judge gets
 * exactly those files, regardless of whether they changed.
 */
export const collectChangedArtifacts = (
  before: Map<string, FileSnapshot>,
  dir: string,
  opts: CaptureOptions = {},
): CapturedArtifacts => {
  const maxBytesPerFile = opts.maxBytesPerFile ?? DEFAULT_MAX_BYTES_PER_FILE;
  const maxTotalBytes = opts.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;

  const result: CapturedArtifacts = { files: new Map(), truncated: [], skipped: [] };

  let candidates: string[];
  if (opts.explicitPaths != null && opts.explicitPaths.length > 0) {
    candidates = [...opts.explicitPaths];
  } else {
    const after = snapshotWorkspace(dir);
    candidates = [];
    for (const [path, snap] of after) {
      const prev = before.get(path);
      if (prev == null || prev.hash !== snap.hash) {
        candidates.push(path);
      }
    }
    candidates.sort();
  }

  let total = 0;
  for (const relPath of candidates) {
    const full = join(dir, relPath);
    if (!existsSync(full)) continue;
    let buf: Buffer;
    try {
      buf = readFileSync(full);
    } catch {
      continue;
    }
    if (!isLikelyText(buf)) continue;

    let content = buf.toString("utf-8");
    if (content.length > maxBytesPerFile) {
      content = `${content.slice(0, maxBytesPerFile)}\n\n[…truncated]`;
      result.truncated.push(relPath);
    }
    if (total + content.length > maxTotalBytes) {
      result.skipped.push(relPath);
      continue;
    }
    total += content.length;
    result.files.set(relPath, content);
  }

  return result;
};
