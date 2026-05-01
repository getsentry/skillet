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
 * Extract case metadata from an eval file by regex scan. Handles
 * both supported file shapes:
 *
 * - **Harness-first callback form** (`describeEval(id, opts, (it) => { it("name", ...) })`):
 *   the suite name is the `tests_behavior` for every case in the
 *   file (skillet generates one suite per behavior). Case names
 *   come from `it("...", ...)` calls.
 *
 * - **Data-array form (legacy)** (`describeEval(id, { data: [{ name, tests_behavior, ... }] })`):
 *   case names and `tests_behavior` are paired inside each object
 *   in the `data` array.
 *
 * If both shapes appear in the same file (rare; only if hand-edited),
 * results from both scans are returned.
 */
export const extractCasesFromEvalTs = (filePath: string): DiscoveredCase[] => {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  const cases: DiscoveredCase[] = [];

  // ── Callback form: describeEval("id", ...) + it("name", ...)
  const suiteId = extractDescribeEvalName(content);
  if (suiteId != null) {
    const itRe = /\bit\s*\(\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/g;
    let match: RegExpExecArray | null;
    while ((match = itRe.exec(content)) !== null) {
      const name = match[1] ?? match[2] ?? match[3];
      if (name == null || name === "") continue;
      cases.push({ name, testsBehavior: suiteId, filePath });
    }
  }

  // ── Data-array form: { name: "...", tests_behavior: "..." }
  // Match each case object: `{ ... }` that contains a `name:` field.
  // Scan for `name:` first, then look back to the opening `{` and
  // forward to the matching `}` to bound the object.
  const fieldRe = /\bname\s*:\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/g;
  let match: RegExpExecArray | null;
  while ((match = fieldRe.exec(content)) !== null) {
    const name = match[1] ?? match[2] ?? match[3];
    if (name == null || name === "") continue;

    const objectBounds = findEnclosingObject(content, match.index);
    if (objectBounds == null) continue;
    const objectText = content.slice(objectBounds.start, objectBounds.end);

    const tbMatch = /\btests_behavior\s*:\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/.exec(objectText);
    const testsBehavior = tbMatch?.[1] ?? tbMatch?.[2] ?? tbMatch?.[3];

    // Skip cases whose object lacks `tests_behavior` — those are
    // not data-array eval cases (e.g. a judge declaration's options
    // bag, an unrelated config object).
    if (testsBehavior == null || testsBehavior === "") continue;

    cases.push({ name, testsBehavior, filePath });
  }

  // Dedupe by (name, testsBehavior, filePath); both scans may
  // surface the same case if a file mixes shapes by accident.
  const seen = new Set<string>();
  return cases.filter((c) => {
    const key = `${c.name}\0${c.testsBehavior ?? ""}\0${c.filePath}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * Extract the suite id from the first `describeEval("id", ...)` call
 * in the file. Returns `null` if no call is found (meaning the file
 * uses the data-array form or is hand-rolled).
 */
const extractDescribeEvalName = (content: string): string | null => {
  const re = /\bdescribeEval\s*\(\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/;
  const m = re.exec(content);
  if (m == null) return null;
  const name = m[1] ?? m[2] ?? m[3];
  return name != null && name !== "" ? name : null;
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
