import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { globSync } from "node:fs";
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

export type Check = WorkspaceCheck | OutputContainsCheck | OutputNotContainsCheck | OutputMatchesCheck;

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

export function isWorkspaceCheck(c: Check): c is WorkspaceCheck {
  return "run" in c;
}

export function isOutputContains(c: Check): c is OutputContainsCheck {
  return "output_contains" in c;
}

export function isOutputNotContains(c: Check): c is OutputNotContainsCheck {
  return "output_not_contains" in c;
}

export function isOutputMatches(c: Check): c is OutputMatchesCheck {
  return "output_matches" in c;
}

// ── Discovery & Parsing ──────────────────────────────────────

/**
 * Find all .eval.yaml files under a skill's evals/ directory.
 */
export function discoverEvalFiles(skillRoot: string): string[] {
  const evalsDir = join(skillRoot, "evals");
  const pattern = join(evalsDir, "**", "*.eval.yaml");

  // Use a simple recursive file search since globSync may not be available
  const files: string[] = [];
  findYamlFiles(evalsDir, files);
  return files.sort();
}

function findYamlFiles(dir: string, out: string[]): void {
  let entries: string[];
  try {
    const { readdirSync, statSync } = require("node:fs");
    entries = readdirSync(dir);
  } catch {
    return; // directory doesn't exist
  }

  const { statSync } = require("node:fs");
  const { join } = require("node:path");

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
}

/**
 * Parse a single .eval.yaml file into eval cases.
 */
export function parseEvalFile(filePath: string): EvalFile {
  const raw = readFileSync(filePath, "utf-8");
  const parsed = parseYaml(raw);

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Invalid eval file: ${filePath} — expected object with 'evals' array`);
  }

  const doc = parsed as Record<string, unknown>;
  const cases = doc.evals;

  if (!Array.isArray(cases)) {
    throw new Error(`Invalid eval file: ${filePath} — 'evals' must be an array`);
  }

  return {
    path: filePath,
    cases: cases.map((c: any, i: number) => {
      if (!c.name) throw new Error(`Eval case ${i} in ${filePath} missing 'name'`);
      if (!c.turns || !Array.isArray(c.turns) || c.turns.length === 0) {
        throw new Error(`Eval case "${c.name}" in ${filePath} missing 'turns'`);
      }
      return {
        name: c.name,
        workspace: c.workspace,
        turns: c.turns,
        checks: c.checks,
        criteria: c.criteria,
        threshold: c.threshold,
        timeout: c.timeout,
        requires: c.requires,
      } satisfies EvalCase;
    }),
  };
}
