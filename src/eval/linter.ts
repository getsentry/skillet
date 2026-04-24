import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

// ── Types ─────────────────────────────────────────────────

export interface LintFix {
  path: string;
  message: string;
}

export interface LintError {
  path: string;
  message: string;
}

export interface LintResult {
  /** Fatal issues — YAML should not be written */
  errors: LintError[];
  /** Auto-applied fixes */
  fixes: LintFix[];
  /** The corrected YAML string (only if no errors) */
  fixedYaml?: string;
}

// ── Helpers ───────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => {
  return v != null && typeof v === "object" && !Array.isArray(v);
};

/**
 * Extract Python-style inline regex flags (?i), (?s), (?m) and
 * return { cleaned, flags } where flags are JS RegExp flags.
 */
const extractInlineFlags = (pattern: string): { cleaned: string; flags: string } => {
  let flags = "";
  let cleaned = pattern;

  const inlineMatch = /^\(\?([ims]+)\)/.exec(cleaned);
  if (inlineMatch?.[1] != null) {
    for (const ch of inlineMatch[1]) {
      if (ch === "i") {
        flags += "i";
      }
      if (ch === "s") {
        flags += "s";
      }
      // m is default in our regex builder
    }
    cleaned = cleaned.slice(inlineMatch[0].length);
  }

  return { cleaned, flags };
};

const isValidRegex = (pattern: string): boolean => {
  try {
    const { cleaned, flags } = extractInlineFlags(pattern);
    const _test = new RegExp(cleaned, "m" + flags);
    void _test;
    return true;
  } catch {
    return false;
  }
};

const hasInlineFlags = (pattern: string): boolean => {
  return /^\(\?[ims]+\)/.test(pattern);
};

const stripInlineFlags = (pattern: string): string => {
  return extractInlineFlags(pattern).cleaned;
};

// ── Linter ────────────────────────────────────────────────

const MIN_TIMEOUT = 5_000;
const MAX_TIMEOUT = 300_000;
const DEFAULT_FIX_TIMEOUT_LOW = 30_000;
const DEFAULT_FIX_TIMEOUT_HIGH = 120_000;

/**
 * Lint eval YAML content. Returns errors, auto-fixes, and optionally the fixed YAML.
 */
export const lintEvalYaml = (yamlContent: string): LintResult => {
  const errors: LintError[] = [];
  const fixes: LintFix[] = [];

  // Parse YAML
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlContent);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push({ path: "root", message: `Invalid YAML: ${msg}` });
    return { errors, fixes };
  }

  if (!isRecord(parsed)) {
    errors.push({ path: "root", message: "Top-level must be an object with 'evals' key" });
    return { errors, fixes };
  }

  if (!Array.isArray(parsed.evals)) {
    errors.push({ path: "root", message: "'evals' must be an array" });
    return { errors, fixes };
  }

  const cases = parsed.evals as unknown[];
  let mutated = false;

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const path = `evals[${i}]`;

    if (!isRecord(c)) {
      errors.push({ path, message: "Each eval case must be an object" });
      continue;
    }

    // Required fields
    if (typeof c.name !== "string" || c.name.trim() === "") {
      errors.push({ path: `${path}.name`, message: "Missing or empty 'name'" });
    }

    if (!Array.isArray(c.turns) || c.turns.length === 0) {
      errors.push({ path: `${path}.turns`, message: "Missing or empty 'turns' array" });
    } else {
      for (let t = 0; t < c.turns.length; t++) {
        if (typeof c.turns[t] !== "string") {
          errors.push({ path: `${path}.turns[${t}]`, message: "Turn must be a string" });
        }
      }
    }

    // Timeout bounds
    if (typeof c.timeout === "number") {
      if (c.timeout < MIN_TIMEOUT) {
        fixes.push({
          path: `${path}.timeout`,
          message: `Timeout ${c.timeout}ms too low, fixed to ${DEFAULT_FIX_TIMEOUT_LOW}ms`,
        });
        c.timeout = DEFAULT_FIX_TIMEOUT_LOW;
        mutated = true;
      } else if (c.timeout > MAX_TIMEOUT) {
        fixes.push({
          path: `${path}.timeout`,
          message: `Timeout ${c.timeout}ms too high, fixed to ${DEFAULT_FIX_TIMEOUT_HIGH}ms`,
        });
        c.timeout = DEFAULT_FIX_TIMEOUT_HIGH;
        mutated = true;
      }
    }

    // Threshold bounds
    if (typeof c.threshold === "number" && (c.threshold < 0 || c.threshold > 1)) {
      fixes.push({
        path: `${path}.threshold`,
        message: `Threshold ${c.threshold} out of [0,1] range, fixed to 0.75`,
      });
      c.threshold = 0.75;
      mutated = true;
    }

    // Lint checks
    if (Array.isArray(c.checks)) {
      for (let j = 0; j < c.checks.length; j++) {
        const check = c.checks[j];
        if (!isRecord(check)) {
          continue;
        }
        const checkPath = `${path}.checks[${j}]`;

        // Regex in matches
        if (typeof check.matches === "string") {
          const result = lintRegexField(check, "matches", checkPath, errors, fixes);
          if (result) {
            mutated = true;
          }
        }

        // Regex in output_matches
        if (typeof check.output_matches === "string") {
          const result = lintRegexField(check, "output_matches", checkPath, errors, fixes);
          if (result) {
            mutated = true;
          }
        }

        // Warn on run without assertion
        if (
          typeof check.run === "string" &&
          check.matches === undefined &&
          check.contains === undefined &&
          check.not_contains === undefined &&
          check.equals === undefined &&
          check.not_equals === undefined &&
          check.exits === undefined
        ) {
          fixes.push({
            path: checkPath,
            message: `Check runs '${check.run}' but has no assertion — will always pass`,
          });
        }
      }
    }
  }

  if (errors.length > 0) {
    return { errors, fixes };
  }

  const fixedYaml = mutated ? stringifyYaml(parsed) : yamlContent;
  return { errors, fixes, fixedYaml };
};

/**
 * Lint a regex field — rewrite inline flags, validate syntax.
 * Returns true if the field was mutated.
 */
const lintRegexField = (
  check: Record<string, unknown>,
  field: string,
  checkPath: string,
  errors: LintError[],
  fixes: LintFix[],
): boolean => {
  const pattern = check[field];
  if (typeof pattern !== "string") {
    return false;
  }

  // Rewrite inline flags
  if (hasInlineFlags(pattern)) {
    const cleaned = stripInlineFlags(pattern);
    if (isValidRegex(cleaned)) {
      fixes.push({
        path: `${checkPath}.${field}`,
        message: `Rewrote Python-style inline flags: "${pattern}" → "${cleaned}"`,
      });
      check[field] = cleaned;
      return true;
    }
  }

  // Validate regex compiles
  if (!isValidRegex(pattern)) {
    errors.push({
      path: `${checkPath}.${field}`,
      message: `Invalid regex: "${pattern}"`,
    });
  }

  return false;
};
