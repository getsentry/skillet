/**
 * Discover `.eval.ts` files and extract the case metadata that
 * `verifyCoverage` needs (case names + `tests_behavior` IDs).
 *
 * Skillet generates eval files in a known template, so a regex scan
 * of the `data` array is sufficient. Adding a full TypeScript AST
 * parser would be heavyweight for what is, in practice, extracting
 * two string literals per case.
 *
 * Hand-edited eval files that deviate from the template may not
 * extract correctly. That's acceptable — coverage verification is
 * a tooling-driven check; users editing eval files directly take
 * responsibility for keeping `tests_behavior` discoverable.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export interface DiscoveredCase {
  /** The `name` field on the case object. */
  name: string;
  /** The `tests_behavior` field, if present. */
  testsBehavior?: string;
  /** Path of the eval file the case was discovered in. */
  filePath: string;
}

export interface DiscoveredEvalFile {
  path: string;
  cases: DiscoveredCase[];
}

/**
 * Recursively glob for `*.eval.ts` files under `<skillRoot>/evals/`.
 * Returns an empty array if the evals directory doesn't exist.
 */
export const discoverEvalTsFiles = (skillRoot: string): string[] => {
  const evalsDir = join(skillRoot, "evals");
  const out: string[] = [];
  walk(evalsDir, out);
  return out;
};

const walk = (dir: string, out: string[]): void => {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walk(full, out);
    } else if (entry.endsWith(".eval.ts")) {
      out.push(full);
    }
  }
};

/**
 * Extract case metadata from an eval file by regex scan. Looks for
 * each `name: "<value>"` paired with the nearest `tests_behavior:
 * "<value>"` in the same case object.
 *
 * The scan walks character by character, identifying object braces
 * inside the `data` array, and captures the two fields per object.
 */
export const extractCasesFromEvalTs = (filePath: string): DiscoveredCase[] => {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  const cases: DiscoveredCase[] = [];
  // Match each case object: { ... } that contains a `name:` field.
  // We scan for `name:` first, then look back to the opening `{` and
  // forward to the matching `}` to find the bounded object.
  const fieldRe = /\bname\s*:\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/g;
  let match: RegExpExecArray | null;
  while ((match = fieldRe.exec(content)) !== null) {
    const name = match[1] ?? match[2] ?? match[3];
    if (name == null || name === "") continue;

    // Find the bounding object for this `name:` field.
    const objectBounds = findEnclosingObject(content, match.index);
    if (objectBounds == null) continue;
    const objectText = content.slice(objectBounds.start, objectBounds.end);

    // Inside that object, look for tests_behavior.
    const tbMatch = /\btests_behavior\s*:\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/.exec(objectText);
    const testsBehavior = tbMatch?.[1] ?? tbMatch?.[2] ?? tbMatch?.[3];

    const c: DiscoveredCase = { name, filePath };
    if (testsBehavior != null && testsBehavior !== "") {
      c.testsBehavior = testsBehavior;
    }
    cases.push(c);
  }

  return cases;
};

/**
 * Find the `{ ... }` object that encloses the given position.
 * Returns inclusive start (the `{`) and exclusive end (after `}`).
 *
 * Naive brace-balanced scan; doesn't handle every edge case (e.g.
 * unbalanced braces inside strings or template literals across
 * lines), but skillet's generated format is regular enough that
 * this works.
 */
const findEnclosingObject = (text: string, pos: number): { start: number; end: number } | null => {
  // Walk backwards to find the opening brace at depth 0.
  let depth = 0;
  let start = -1;
  for (let i = pos - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === "}") depth++;
    else if (ch === "{") {
      if (depth === 0) {
        start = i;
        break;
      }
      depth--;
    }
  }
  if (start === -1) return null;

  // Walk forward from `start + 1` to the matching `}`.
  depth = 1;
  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return { start, end: i + 1 };
    }
  }
  return null;
};

/**
 * Discover all eval files and extract their cases. Convenience
 * wrapper used by verify and other consumers that need both.
 */
export const discoverAndExtract = (skillRoot: string): DiscoveredEvalFile[] => {
  const out: DiscoveredEvalFile[] = [];
  for (const filePath of discoverEvalTsFiles(skillRoot)) {
    out.push({ path: filePath, cases: extractCasesFromEvalTs(filePath) });
  }
  return out;
};
