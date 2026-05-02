/**
 * Discover `.eval.ts` files and extract the case metadata that
 * `verifyCoverage` needs (case names + `tests_behavior` IDs).
 *
 * Skillet's eval-gen emits the harness-first callback form
 * (`describeEval(id, opts, (it) => { it("name", ...) })`) where the
 * suite id doubles as `tests_behavior` — one suite per behavior. A
 * regex scan extracts both: the `describeEval` name pins
 * `tests_behavior`, each `it("...")` provides a case name. Adding
 * a TypeScript AST parser is heavyweight for what amounts to two
 * string literals per case.
 *
 * Hand-edited eval files that deviate from this shape may not
 * extract correctly. That's acceptable — coverage verification is
 * a tooling-driven check; users editing eval files directly take
 * responsibility for keeping `tests_behavior` discoverable.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export interface DiscoveredCase {
  /** The `it("...")` name. */
  name: string;
  /** The suite id from `describeEval("...", ...)` — same for every case in the file. */
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
 * Extract case metadata from an eval file. Pulls the suite id from
 * the file's `describeEval("...", ...)` call and one case per
 * `it("...", ...)` call inside.
 */
export const extractCasesFromEvalTs = (filePath: string): DiscoveredCase[] => {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  const suiteId = extractDescribeEvalName(content);
  if (suiteId == null) return [];

  const cases: DiscoveredCase[] = [];
  const itRe = /\bit\s*\(\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/g;
  let match: RegExpExecArray | null;
  while ((match = itRe.exec(content)) !== null) {
    const name = match[1] ?? match[2] ?? match[3];
    if (name == null || name === "") continue;
    cases.push({ name, testsBehavior: suiteId, filePath });
  }
  return cases;
};

/**
 * Extract the suite id from the first `describeEval("id", ...)`
 * call in the file. Returns `null` if no call is found (meaning the
 * file isn't a skillet-shaped eval).
 */
const extractDescribeEvalName = (content: string): string | null => {
  const re = /\bdescribeEval\s*\(\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/;
  const m = re.exec(content);
  if (m == null) return null;
  const name = m[1] ?? m[2] ?? m[3];
  return name != null && name !== "" ? name : null;
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
