import { readFileSync, readdirSync, statSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { join } from "node:path";

// ── Types ──────────────────────────────────────────────────

export interface RequiresEnv {
  env: string;
}

export interface RequiresCommand {
  command: string;
}

export type Requirement = RequiresEnv | RequiresCommand;

export interface WorkspaceCheck {
  run: string;
  matches?: string;
  contains?: string;
  not_contains?: string;
  equals?: string;
  not_equals?: string;
  exits?: number;
}

export interface OutputContainsCheck {
  output_contains: string;
}

export interface OutputNotContainsCheck {
  output_not_contains: string;
}

export interface OutputMatchesCheck {
  output_matches: string;
}

export type Check =
  | WorkspaceCheck
  | OutputContainsCheck
  | OutputNotContainsCheck
  | OutputMatchesCheck;

export interface EvalCase {
  name: string;
  workspace?: {
    setup?: string;
    cwd?: string;
  };
  turns: string[];
  checks?: Check[];
  criteria?: string;
  threshold?: number;
  timeout?: number;
  requires?: Requirement[];
}

export interface EvalFile {
  path: string;
  cases: EvalCase[];
}

// ── Type guards ──────────────────────────────────────────────

export const isWorkspaceCheck = (c: Check): c is WorkspaceCheck => {
  return "run" in c;
};

export const isOutputContains = (c: Check): c is OutputContainsCheck => {
  return "output_contains" in c;
};

export const isOutputNotContains = (c: Check): c is OutputNotContainsCheck => {
  return "output_not_contains" in c;
};

export const isOutputMatches = (c: Check): c is OutputMatchesCheck => {
  return "output_matches" in c;
};

// ── Discovery & Parsing ──────────────────────────────────────

/**
 * Find all .eval.yaml files under a skill's evals/ directory.
 */
export const discoverEvalFiles = (skillRoot: string): string[] => {
  const evalsDir = join(skillRoot, "evals");

  // Use a simple recursive file search
  const files: string[] = [];
  findYamlFiles(evalsDir, files);
  // toSorted() requires ES2023; sort the fresh local array in place.
  files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return files;
};

const findYamlFiles = (dir: string, out: string[]): void => {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // directory doesn't exist
  }

  for (const entry of entries) {
    const full = join(dir, entry);
    try {
      const stat = statSync(full);
      if (stat.isDirectory()) {
        findYamlFiles(full, out);
      } else if (entry.endsWith(".eval.yaml")) {
        out.push(full);
      }
    } catch {
      // skip inaccessible entries
    }
  }
};

// ── Field extractors (with narrowing) ────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => {
  return v != null && typeof v === "object" && !Array.isArray(v);
};

const getString = (obj: Record<string, unknown>, key: string): string | undefined => {
  const v = obj[key];
  return typeof v === "string" ? v : undefined;
};

const getNumber = (obj: Record<string, unknown>, key: string): number | undefined => {
  const v = obj[key];
  return typeof v === "number" ? v : undefined;
};

const getRecord = (
  obj: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined => {
  const v = obj[key];
  return isRecord(v) ? v : undefined;
};

const getArray = (obj: Record<string, unknown>, key: string): unknown[] | undefined => {
  const v = obj[key];
  return Array.isArray(v) ? v : undefined;
};

const parseWorkspace = (raw: Record<string, unknown> | undefined): EvalCase["workspace"] => {
  if (raw == null) return undefined;
  const ws: EvalCase["workspace"] = {};
  const setup = getString(raw, "setup");
  const cwd = getString(raw, "cwd");
  if (setup != null) ws.setup = setup;
  if (cwd != null) ws.cwd = cwd;
  return ws;
};

const parseTurns = (raw: unknown[] | undefined, caseName: string, filePath: string): string[] => {
  if (raw == null || raw.length === 0) {
    throw new Error(`Eval case "${caseName}" in ${filePath} missing 'turns'`);
  }
  const turns: string[] = [];
  for (const t of raw) {
    if (typeof t !== "string") {
      throw new Error(`Eval case "${caseName}" in ${filePath}: each turn must be a string`);
    }
    turns.push(t);
  }
  return turns;
};

const parseChecks = (raw: unknown[] | undefined): Check[] | undefined => {
  if (raw == null) return undefined;
  const checks: Check[] = [];
  for (const c of raw) {
    if (!isRecord(c)) continue;
    // Narrow to each Check variant via the discriminating key.
    if (typeof c.run === "string") {
      const wc: Check = { run: c.run };
      if (typeof c.matches === "string") wc.matches = c.matches;
      if (typeof c.contains === "string") wc.contains = c.contains;
      if (typeof c.not_contains === "string") wc.not_contains = c.not_contains;
      if (typeof c.equals === "string") wc.equals = c.equals;
      if (typeof c.not_equals === "string") wc.not_equals = c.not_equals;
      if (typeof c.exits === "number") wc.exits = c.exits;
      checks.push(wc);
    } else if (typeof c.output_contains === "string") {
      checks.push({ output_contains: c.output_contains });
    } else if (typeof c.output_not_contains === "string") {
      checks.push({ output_not_contains: c.output_not_contains });
    } else if (typeof c.output_matches === "string") {
      checks.push({ output_matches: c.output_matches });
    }
  }
  return checks;
};

const parseRequires = (raw: unknown[] | undefined): Requirement[] | undefined => {
  if (raw == null) return undefined;
  const out: Requirement[] = [];
  for (const r of raw) {
    if (!isRecord(r)) continue;
    const env = getString(r, "env");
    const command = getString(r, "command");
    if (env != null) {
      out.push({ env });
    } else if (command != null) {
      out.push({ command });
    }
  }
  return out;
};

const parseEvalCase = (
  entry: Record<string, unknown>,
  index: number,
  filePath: string,
): EvalCase => {
  const name = getString(entry, "name");
  if (name == null || name === "") {
    throw new Error(`Eval case ${index} in ${filePath} missing 'name'`);
  }

  const turns = parseTurns(getArray(entry, "turns"), name, filePath);
  const workspace = parseWorkspace(getRecord(entry, "workspace"));
  const checks = parseChecks(getArray(entry, "checks"));
  const criteria = getString(entry, "criteria");
  const threshold = getNumber(entry, "threshold");
  const timeout = getNumber(entry, "timeout");
  const requires = parseRequires(getArray(entry, "requires"));

  const result: EvalCase = { name, turns };
  if (workspace != null) result.workspace = workspace;
  if (checks != null) result.checks = checks;
  if (criteria != null) result.criteria = criteria;
  if (threshold != null) result.threshold = threshold;
  if (timeout != null) result.timeout = timeout;
  if (requires != null) result.requires = requires;
  return result;
};

/**
 * Parse a single .eval.yaml file into eval cases.
 */
export const parseEvalFile = (filePath: string): EvalFile => {
  const raw = readFileSync(filePath, "utf-8");
  const parsed: unknown = parseYaml(raw);

  if (!isRecord(parsed)) {
    throw new Error(`Invalid eval file: ${filePath} — expected object with 'evals' array`);
  }

  const cases = parsed.evals;

  if (!Array.isArray(cases)) {
    throw new Error(`Invalid eval file: ${filePath} — 'evals' must be an array`);
  }

  return {
    path: filePath,
    cases: cases.map((c: unknown, i: number) => {
      if (!isRecord(c)) {
        throw new Error(`Eval case ${i} in ${filePath} must be an object`);
      }
      return parseEvalCase(c, i, filePath);
    }),
  };
};
