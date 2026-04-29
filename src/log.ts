/**
 * Structured phase + event logger.
 *
 * Skillet's failure modes (eval-gen times out, regen fails after 8
 * minutes, JSON malformed) are unfixable without seeing what was
 * happening when they failed. This module provides:
 *
 * - `phase(name, fn)` wraps an async block with start/end events
 *   and timing. Throws propagate; the phase still logs the failure.
 * - `event(level, msg, payload?)` emits a structured line. In
 *   verbose mode, payloads are printed as JSON on a continuation
 *   line; otherwise only message + level appear.
 *
 * All output goes to stderr so stdout stays clean for `--json`
 * results and human-readable summaries.
 */

const ANSI_RESET = "[0m";
const ANSI_DIM = "[2m";
const ANSI_RED = "[31m";
const ANSI_YELLOW = "[33m";
const ANSI_BLUE = "[34m";

let verbose = false;

/**
 * Toggle verbose mode for the rest of the process. Called once
 * during CLI argv parsing or from `SKILLET_VERBOSE=1` detection.
 */
export const setVerbose = (on: boolean): void => {
  verbose = on;
};

export const isVerbose = (): boolean => verbose;

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const colorForLevel = (level: LogLevel): string => {
  if (level === "error") return ANSI_RED;
  if (level === "warn") return ANSI_YELLOW;
  if (level === "info") return ANSI_BLUE;
  return ANSI_DIM;
};

/**
 * Emit a structured event to stderr. In default mode, debug-level
 * events are suppressed. In verbose mode, all levels print and
 * payloads (when given) are appended as a JSON line.
 */
export const event = (level: LogLevel, msg: string, payload?: Record<string, unknown>): void => {
  if (!verbose && LEVEL_PRIORITY[level] < LEVEL_PRIORITY.info) return;
  const color = colorForLevel(level);
  process.stderr.write(`${color}[${level}]${ANSI_RESET} ${msg}\n`);
  if (verbose && payload != null) {
    try {
      const json = JSON.stringify(payload, redactor, 2);
      // Indent payload lines two spaces so it's visually attached
      // to the event without being mistaken for a separate message.
      process.stderr.write(
        `${ANSI_DIM}${json
          .split("\n")
          .map((l) => `  ${l}`)
          .join("\n")}${ANSI_RESET}\n`,
      );
    } catch {
      process.stderr.write(`${ANSI_DIM}  [payload not serializable]${ANSI_RESET}\n`);
    }
  }
};

/**
 * Wrap an async operation with start/end events and elapsed timing.
 * Errors propagate but the phase logs its failure first.
 *
 * Usage:
 *   await phase("regen", async () => {
 *     await regenerateEverything();
 *   });
 */
export const phase = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
  const start = Date.now();
  process.stderr.write(`${ANSI_BLUE}▸${ANSI_RESET} ${name}\n`);
  try {
    const result = await fn();
    const elapsed = Date.now() - start;
    process.stderr.write(`${ANSI_DIM}✓ ${name} (${elapsed}ms)${ANSI_RESET}\n`);
    return result;
  } catch (err: unknown) {
    const elapsed = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${ANSI_RED}✗ ${name} failed (${elapsed}ms): ${msg}${ANSI_RESET}\n`);
    throw err;
  }
};

/**
 * Truncate strings in payloads to avoid 8KB log lines for full
 * LLM responses. In verbose mode strings are kept up to a higher
 * cap; otherwise a tight cap keeps default logs scannable.
 */
const STRING_CAP_DEFAULT = 200;
const STRING_CAP_VERBOSE = 100_000;

const redactor = (_key: string, value: unknown): unknown => {
  if (typeof value !== "string") return value;
  const cap = verbose ? STRING_CAP_VERBOSE : STRING_CAP_DEFAULT;
  if (value.length <= cap) return value;
  return `${value.slice(0, cap)}…[+${value.length - cap} chars]`;
};
