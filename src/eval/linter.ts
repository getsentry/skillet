import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

// ── Types ─────────────────────────────────────────────────

export type LintRule =
  | "timeout-bounds"
  | "threshold-bounds"
  | "regex-inline-flags"
  | "regex-posix-class"
  | "run-without-assertion"
  | "export-in-setup-nudge"
  | "chmod-x-stub"
  | "criteria-without-run"
  | "pair-rule-negative";

/**
 * Load-bearing rules escalate to errors during generation if they
 * survive retries. Advisory rules stay warnings.
 */
export const LOAD_BEARING_RULES: ReadonlySet<LintRule> = new Set<LintRule>([
  "run-without-assertion",
  "criteria-without-run",
  "pair-rule-negative",
]);

export interface LintFix {
  rule: LintRule;
  /** True if the fix mutated the YAML; false means advisory only */
  autoFixed: boolean;
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
  /** Auto-applied fixes and advisory warnings */
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

/**
 * Find variable names exported in a shell script. Skips commented lines.
 * Matches `export FOO=...` and `export FOO` (but not `export -f fn`).
 */
const findExportedVars = (script: string): string[] => {
  const vars: string[] = [];
  for (const rawLine of script.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    const match = /^export\s+([A-Za-z_][A-Za-z0-9_]*)\b/.exec(line);
    if (match?.[1] != null) {
      vars.push(match[1]);
    }
  }
  return vars;
};

/**
 * Find static, shared absolute paths — patterns like `/tmp/foo`, `$HOME/bar`,
 * `~/baz`. Dynamic paths (`$(mktemp ...)`, anything embedding `$VAR` in the
 * leaf name) are allowed because per-eval namespacing makes them safe.
 * System paths under `/dev`, `/bin`, `/sbin`, `/usr`, `/etc` are also fine
 * — they're for referring to system binaries/devices, not for writing state.
 */
const findSharedAbsolutePaths = (text: string): string[] => {
  const hits: string[] = [];
  const patterns = [
    // /tmp/literal, /var/literal, /home/literal, /root/literal,
    // /Users/literal, /private/tmp/literal — leaf must start with a
    // literal char so `$(mktemp -d)` style dynamic paths don't match.
    /(?:\/tmp|\/var|\/home|\/root|\/Users|\/private\/tmp)\/[A-Za-z0-9._-][A-Za-z0-9._/-]*/g,
    // $HOME/literal — leaf starts with literal char
    /\$HOME\/[A-Za-z0-9._-][A-Za-z0-9._/-]*/g,
    // ~/literal at token start (space, =, >, <, |, &, (, ;, start)
    /(?:^|[\s=><|&(;])~\/[A-Za-z0-9._-][A-Za-z0-9._/-]*/g,
  ];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimStart();
    if (line.startsWith("#")) {
      continue;
    }
    for (const re of patterns) {
      let m;
      while ((m = re.exec(rawLine)) !== null) {
        hits.push(m[0].trim());
      }
    }
  }

  return hits;
};

/**
 * If the command is `cat <path>` (possibly quoted, with flags stripped),
 * return the path. Otherwise null. Used to identify file-oriented
 * checks so the pair-rule can match negatives against positives.
 */
const parseCatFile = (cmd: string): string | null => {
  const trimmed = cmd.trim();
  const match = /^cat\s+(?:-[A-Za-z]+\s+)*(?:"([^"]+)"|'([^']+)'|(\S+))\s*$/.exec(trimmed);
  if (match == null) return null;
  return match[1] ?? match[2] ?? match[3] ?? null;
};

/**
 * If the command is `test -s <path>` or `[ -s <path> ]`, return the path.
 */
const parseExistsFile = (cmd: string): string | null => {
  const trimmed = cmd.trim();
  const t = /^test\s+-s\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s*$/.exec(trimmed);
  if (t != null) return t[1] ?? t[2] ?? t[3] ?? null;
  const b = /^\[\s+-s\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s+\]\s*$/.exec(trimmed);
  if (b != null) return b[1] ?? b[2] ?? b[3] ?? null;
  return null;
};

/**
 * Heuristic: does this criteria string look like it's grading agent
 * behavior (refusal, recommendation, dialog) rather than a file
 * artifact? Used as a one-way skip for the `criteria-without-run`
 * warning — keeps the retry loop from hard-failing legit behavior
 * cases. False-negatives (artifact criteria phrased with behavior
 * verbs) are caught downstream by the judge's mismatch self-check.
 */
const looksLikeBehaviorCriteria = (criteria: string): boolean => {
  const patterns = [
    /\brefuse|declin|reject/i,
    /\bask (?:the user|for clarification|about)/i,
    /\bclarif/i,
    /\brecommend|suggest|advis/i,
    /\bthe agent (?:should|must|needs to|has to|is expected)/i,
    /\bshould not proceed/i,
    /\brespond|reply|answer/i,
    /\bexplain (?:that|to the user|why it)/i,
  ];
  return patterns.some((re) => re.test(criteria));
};

const checkSharedPaths = (text: string, path: string, errors: LintError[]): void => {
  const hits = findSharedAbsolutePaths(text);
  if (hits.length > 0) {
    errors.push({
      path,
      message: `Uses shared absolute path(s) ${hits.map((h) => `'${h}'`).join(", ")}. Eval cases run in parallel per-workspace — hardcoded paths under /tmp, /var, $HOME, ~ leak state across cases. Use relative paths (they resolve inside the workspace) or dynamic paths like $(mktemp -d).`,
    });
  }
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
          rule: "timeout-bounds",
          autoFixed: true,
          path: `${path}.timeout`,
          message: `Timeout ${c.timeout}ms too low, fixed to ${DEFAULT_FIX_TIMEOUT_LOW}ms`,
        });
        c.timeout = DEFAULT_FIX_TIMEOUT_LOW;
        mutated = true;
      } else if (c.timeout > MAX_TIMEOUT) {
        fixes.push({
          rule: "timeout-bounds",
          autoFixed: true,
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
        rule: "threshold-bounds",
        autoFixed: true,
        path: `${path}.threshold`,
        message: `Threshold ${c.threshold} out of [0,1] range, fixed to 0.75`,
      });
      c.threshold = 0.75;
      mutated = true;
    }

    // Error on `export` in setup scripts — env doesn't persist to the
    // agent's fresh-process bash calls, so exports here are always wrong.
    // Previously a warning; upgraded to error because generators kept
    // emitting it regardless.
    if (isRecord(c.workspace) && typeof c.workspace.setup === "string") {
      const exported = findExportedVars(c.workspace.setup);
      if (exported.length > 0) {
        errors.push({
          path: `${path}.workspace.setup`,
          message: `Setup exports ${exported.map((v) => `'${v}'`).join(", ")}, but the agent's bash calls run in fresh processes — exports won't reach them. Write stubs or data into the workspace and have the skill invoke them by path.`,
        });
      }
      checkSharedPaths(c.workspace.setup, `${path}.workspace.setup`, errors);
      // Nudge: `chmod +x` in setup usually means a stub is being
      // prepared. For content-writing skills, have the skill write its
      // deliverable to a plain file and check the file — don't simulate
      // an executable.
      if (/\bchmod\s+\+x\b/.test(c.workspace.setup)) {
        fixes.push({
          rule: "chmod-x-stub",
          autoFixed: false,
          path: `${path}.workspace.setup`,
          message: `Setup chmod +x's a file — this usually indicates a stubbed external command. If the skill's deliverable is text content, prefer having it write to a plain file (e.g., DRAFT.md) and check the file instead of simulating a CLI.`,
        });
      }
    }

    // Ban shared absolute paths in turns and checks — they leak state
    // across parallel cases.
    if (Array.isArray(c.turns)) {
      for (let t = 0; t < c.turns.length; t++) {
        const turn = c.turns[t];
        if (typeof turn === "string") {
          checkSharedPaths(turn, `${path}.turns[${t}]`, errors);
        }
      }
    }

    // Warn: case has case-level `criteria` but no `run:` workspace checks.
    // The judge will grade only the agent transcript — if the skill's
    // deliverable is a file, add a `run: cat <file>` check so the judge
    // sees the artifact.
    //
    // Skip the warning when the criteria clearly targets agent behavior
    // (refusal, recommendation, asking for clarification) — those cases
    // legitimately have no artifact to cat, and the retry loop's
    // "push-back" would hard-fail them with no way forward. The judge
    // self-check (round 3) catches any false-negative at eval time by
    // grading E with an artifact-mismatch note.
    if (typeof c.criteria === "string" && c.criteria.trim() !== "") {
      const hasRunCheck =
        Array.isArray(c.checks) &&
        c.checks.some((ch) => isRecord(ch) && typeof ch.run === "string");
      if (!hasRunCheck && !looksLikeBehaviorCriteria(c.criteria)) {
        fixes.push({
          rule: "criteria-without-run",
          autoFixed: false,
          path: `${path}.criteria`,
          message: `Case has 'criteria' but no 'run:' checks — the judge will grade the agent transcript only. If the skill's deliverable is a file, add a \`run: cat <file>\` check (any passing assertion) so the judge sees the artifact.`,
        });
      }
    }

    // Pair-rule: a negative file check (`cat F | not_contains`) passes
    // vacuously when F is missing or empty. Require a sibling positive
    // check on the same file (`contains`, `matches`, or `test -s F`).
    if (Array.isArray(c.checks)) {
      const negFiles = new Map<string, number>();
      const posFiles = new Set<string>();
      for (let j = 0; j < c.checks.length; j++) {
        const check = c.checks[j];
        if (!isRecord(check)) continue;
        if (typeof check.run !== "string") continue;

        const catFile = parseCatFile(check.run);
        if (catFile != null) {
          if (check.not_contains !== undefined || check.not_equals !== undefined) {
            if (!negFiles.has(catFile)) {
              negFiles.set(catFile, j);
            }
          }
          if (
            check.contains !== undefined ||
            check.matches !== undefined ||
            check.equals !== undefined
          ) {
            posFiles.add(catFile);
          }
        }

        const existsFile = parseExistsFile(check.run);
        if (existsFile != null && check.exits === 0) {
          posFiles.add(existsFile);
        }
      }
      for (const [file, idx] of negFiles) {
        if (!posFiles.has(file)) {
          fixes.push({
            rule: "pair-rule-negative",
            autoFixed: false,
            path: `${path}.checks[${idx}]`,
            message: `Negative check on '${file}' without a sibling positive check — a missing or empty file will pass this vacuously. Add \`run: cat ${file}\` with \`contains\`/\`matches\`, or \`run: test -s ${file}\` with \`exits: 0\`.`,
          });
        }
      }
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
            rule: "run-without-assertion",
            autoFixed: false,
            path: checkPath,
            message: `Check runs '${check.run}' but has no assertion — will always pass`,
          });
        }

        // Ban shared absolute paths in check.run commands.
        if (typeof check.run === "string") {
          checkSharedPaths(check.run, `${checkPath}.run`, errors);
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
 * POSIX character classes → JS regex equivalents. These are valid in
 * many regex engines (grep, sed, awk) but JS interprets `[[:space:]]`
 * as the character set `[:space]` followed by a literal `]` — the
 * pattern compiles without error and silently never matches whitespace.
 */
const POSIX_CLASS_MAP: Record<string, string> = {
  "[[:alpha:]]": "[a-zA-Z]",
  "[[:alnum:]]": "[a-zA-Z0-9]",
  "[[:digit:]]": "\\d",
  "[[:space:]]": "\\s",
  "[[:upper:]]": "[A-Z]",
  "[[:lower:]]": "[a-z]",
  "[[:xdigit:]]": "[0-9a-fA-F]",
  "[[:blank:]]": "[ \\t]",
};

const POSIX_CLASS_UNMAPPED = new Set(["[[:punct:]]", "[[:print:]]", "[[:graph:]]", "[[:cntrl:]]"]);

const replacePosixClasses = (
  pattern: string,
): { rewritten: string; changes: Array<{ from: string; to: string }>; unknown: string[] } => {
  const changes: Array<{ from: string; to: string }> = [];
  const unknown: string[] = [];
  let rewritten = pattern;

  for (const [posix, js] of Object.entries(POSIX_CLASS_MAP)) {
    if (rewritten.includes(posix)) {
      rewritten = rewritten.split(posix).join(js);
      changes.push({ from: posix, to: js });
    }
  }

  for (const posix of POSIX_CLASS_UNMAPPED) {
    if (rewritten.includes(posix)) {
      unknown.push(posix);
    }
  }

  return { rewritten, changes, unknown };
};

/**
 * Lint a regex field — rewrite inline flags, normalize POSIX classes,
 * validate syntax. Returns true if the field was mutated.
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

  let current = pattern;
  let mutated = false;

  // Rewrite POSIX classes first — they can hide inside patterns that
  // also have inline flags.
  const posix = replacePosixClasses(current);
  if (posix.unknown.length > 0) {
    errors.push({
      path: `${checkPath}.${field}`,
      message: `Pattern uses POSIX character class(es) ${posix.unknown.join(", ")} without a JS equivalent — rewrite using \\s, \\d, or explicit character ranges.`,
    });
  }
  if (posix.changes.length > 0) {
    const summary = posix.changes.map((c) => `${c.from} → ${c.to}`).join(", ");
    fixes.push({
      rule: "regex-posix-class",
      autoFixed: true,
      path: `${checkPath}.${field}`,
      message: `Rewrote POSIX character class(es): ${summary}`,
    });
    current = posix.rewritten;
    check[field] = current;
    mutated = true;
  }

  // Rewrite inline flags
  if (hasInlineFlags(current)) {
    const cleaned = stripInlineFlags(current);
    if (isValidRegex(cleaned)) {
      fixes.push({
        rule: "regex-inline-flags",
        autoFixed: true,
        path: `${checkPath}.${field}`,
        message: `Rewrote Python-style inline flags: "${current}" → "${cleaned}"`,
      });
      current = cleaned;
      check[field] = current;
      mutated = true;
    }
  }

  // Validate regex compiles
  if (!isValidRegex(current)) {
    errors.push({
      path: `${checkPath}.${field}`,
      message: `Invalid regex: "${current}"`,
    });
  }

  return mutated;
};
