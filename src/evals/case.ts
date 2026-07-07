import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Issue } from "../spec/types.js";

export const CHECK_KINDS = ["file_exists", "shell", "judge"] as const;
export type CheckKind = (typeof CHECK_KINDS)[number];

export interface Check {
  kind: CheckKind;
  value: string;
}

export interface EvalCase {
  /** Case file name without extension — the id used by `--case`. */
  id: string;
  /** Path relative to the skill root, for messages. */
  file: string;
  behavior: string;
  prompt: string;
  fixture?: string;
  setup?: string;
  checks: Check[];
  trials: number;
  timeout: number;
}

export interface CaseLoadResult {
  cases: EvalCase[];
  issues: Issue[];
}

export const DEFAULT_TIMEOUT_SECONDS = 300;

const KNOWN_FIELDS = new Set([
  "behavior",
  "prompt",
  "fixture",
  "setup",
  "checks",
  "trials",
  "timeout",
]);

const isRecord = (v: unknown): v is Record<string, unknown> => {
  return v != null && typeof v === "object" && !Array.isArray(v);
};

/**
 * Parse and validate one case file's content (validation spec, "Eval
 * file structural validation"). Returns a case only when it has no
 * errors; warnings ride along either way.
 */
export const parseCase = (
  file: string,
  content: string,
): { evalCase: EvalCase | null; issues: Issue[] } => {
  const issues: Issue[] = [];
  const error = (message: string, hint?: string): void => {
    issues.push({
      severity: "error",
      message: `${file}: ${message}`,
      ...(hint != null && { hint }),
    });
  };
  const warn = (message: string, hint?: string): void => {
    issues.push({
      severity: "warning",
      message: `${file}: ${message}`,
      ...(hint != null && { hint }),
    });
  };

  let data: unknown;
  try {
    data = parseYaml(content);
  } catch (err) {
    error(`invalid YAML — ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
    return { evalCase: null, issues };
  }
  if (!isRecord(data)) {
    error("case file must be a YAML mapping");
    return { evalCase: null, issues };
  }

  for (const key of Object.keys(data)) {
    if (!KNOWN_FIELDS.has(key)) {
      warn(`unknown field "${key}"`, `Known fields: ${[...KNOWN_FIELDS].join(", ")}.`);
    }
  }

  const rawBehavior = data["behavior"];
  const behavior =
    typeof rawBehavior === "string" && rawBehavior.trim() !== "" ? rawBehavior.trim() : null;
  if (behavior == null) {
    error('missing required field "behavior"', "Reference a behavior id from spec.md.");
  }
  const rawPrompt = data["prompt"];
  const prompt = typeof rawPrompt === "string" && rawPrompt.trim() !== "" ? rawPrompt : null;
  if (prompt == null) {
    error('missing required field "prompt"', "The user message given to the agent under test.");
  }

  const checks: Check[] = [];
  const rawChecks = data["checks"];
  if (rawChecks != null) {
    if (!Array.isArray(rawChecks)) {
      error('"checks" must be a list');
    } else {
      for (const [i, entry] of rawChecks.entries()) {
        if (!isRecord(entry) || Object.keys(entry).length !== 1) {
          error(
            `check ${i + 1} must be a single-key mapping`,
            `Supported checks: ${CHECK_KINDS.join(", ")}.`,
          );
          continue;
        }
        const rawKind = Object.keys(entry)[0] ?? "";
        const value = entry[rawKind];
        const kind = CHECK_KINDS.find((k) => k === rawKind);
        if (kind == null) {
          error(
            `check ${i + 1} has unsupported type "${rawKind}"`,
            `Supported checks: ${CHECK_KINDS.join(", ")}.`,
          );
          continue;
        }
        if (typeof value !== "string" || value.trim() === "") {
          error(`check ${i + 1} (${kind}) must have a non-empty string value`);
          continue;
        }
        checks.push({ kind, value: value.trim() });
      }
    }
  }
  if (checks.length === 0) {
    warn(
      "case has no checks — it proves nothing",
      "Add at least one file_exists, shell, or judge check.",
    );
  }

  const rawTrials = data["trials"] ?? 1;
  const trials =
    typeof rawTrials === "number" && Number.isInteger(rawTrials) && rawTrials >= 1
      ? rawTrials
      : null;
  if (trials == null) {
    error('"trials" must be a positive integer');
  }
  const rawTimeout = data["timeout"] ?? DEFAULT_TIMEOUT_SECONDS;
  const timeout = typeof rawTimeout === "number" && rawTimeout > 0 ? rawTimeout : null;
  if (timeout == null) {
    error('"timeout" must be a positive number of seconds');
  }

  const fixture = data["fixture"];
  if (fixture != null && (typeof fixture !== "string" || fixture.trim() === "")) {
    error('"fixture" must be a non-empty string slug');
  }
  const setup = data["setup"];
  if (setup != null && typeof setup !== "string") {
    error('"setup" must be a shell script string');
  }

  if (
    issues.some((i) => i.severity === "error") ||
    behavior == null ||
    prompt == null ||
    trials == null ||
    timeout == null
  ) {
    return { evalCase: null, issues };
  }

  const evalCase: EvalCase = {
    id: basename(file).replace(/\.ya?ml$/, ""),
    file,
    behavior,
    prompt,
    ...(typeof fixture === "string" && { fixture: fixture.trim() }),
    ...(typeof setup === "string" && { setup }),
    checks,
    trials,
    timeout,
  };
  return { evalCase, issues };
};

/** Load all cases under `<skillRoot>/evals/cases/`. */
export const loadCases = (skillRoot: string): CaseLoadResult => {
  const casesDir = join(skillRoot, "evals", "cases");
  const issues: Issue[] = [];
  const cases: EvalCase[] = [];
  let entries: string[];
  try {
    entries = readdirSync(casesDir)
      .filter((f) => /\.ya?ml$/.test(f))
      .toSorted();
  } catch {
    return { cases, issues };
  }
  for (const entry of entries) {
    const rel = join("evals", "cases", entry);
    const parsed = parseCase(rel, readFileSync(join(casesDir, entry), "utf-8"));
    issues.push(...parsed.issues);
    if (parsed.evalCase != null) cases.push(parsed.evalCase);
  }
  return { cases, issues };
};

/** Fixture slugs available under `<skillRoot>/evals/fixtures/`. */
export const listFixtures = (skillRoot: string): Set<string> => {
  const dir = join(skillRoot, "evals", "fixtures");
  try {
    return new Set(readdirSync(dir).filter((f) => statSync(join(dir, f)).isDirectory()));
  } catch {
    return new Set();
  }
};
