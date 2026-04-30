/**
 * Persist a failed LLM output to disk for post-mortem inspection,
 * and return the path. Used by JSON-output phases when parse or
 * schema validation fails — the warn log includes the path so an
 * engineer can read the full output without rerunning.
 *
 * Files land under `.skillet-tmp/failed-outputs/` in the current
 * working directory. The file is overwritten on each call with the
 * same key, so retries inside a single run don't pile up.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const FAILED_DIR = ".skillet-tmp/failed-outputs";

const safeFilename = (s: string): string => {
  return s.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
};

export interface SaveFailedOutputInput {
  phase: string;
  /** Per-call identifier — e.g. behavior id, reference path. */
  key: string;
  /** Attempt number (1-indexed). */
  attempt: number;
  /** Raw LLM response. */
  raw: string;
  /** Parse / schema error message. */
  errorMessage: string;
  /** What kind of failure: "parse" (JSON.parse failed) or
   *  "schema" (parsed but didn't match expected shape). */
  kind: "parse" | "schema";
}

export interface SaveFailedOutputResult {
  /** Absolute path to the saved file. */
  path: string;
  /** First ~600 chars of the raw output, suitable for inline log. */
  excerpt: string;
}

export const saveFailedOutput = (input: SaveFailedOutputInput): SaveFailedOutputResult => {
  const dir = resolve(FAILED_DIR);
  const filename = `${safeFilename(input.phase)}-${safeFilename(input.key)}-attempt-${input.attempt}.txt`;
  const path = join(dir, filename);
  try {
    mkdirSync(dir, { recursive: true });
    const header = [
      `# Failed LLM output`,
      `# phase:   ${input.phase}`,
      `# key:     ${input.key}`,
      `# attempt: ${input.attempt}`,
      `# kind:    ${input.kind}`,
      `# error:   ${input.errorMessage}`,
      `# ---`,
      "",
    ].join("\n");
    writeFileSync(path, header + input.raw, "utf-8");
  } catch {
    // Failing to persist diagnostics must never break the loop.
    return { path: "(could not persist)", excerpt: input.raw.slice(0, 600) };
  }
  return { path, excerpt: input.raw.slice(0, 600) };
};
