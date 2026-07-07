/**
 * Output conventions (cli spec, "JSON output convention"):
 * - `--json` mode emits exactly one JSON object on stdout, no ANSI.
 * - Command results in human mode go to stdout via `print`.
 * - Progress, help, and errors go to stderr via `info`/`fail`.
 * - Exit codes: 0 success, 1 failure.
 */

/** Human-mode command output (stdout). */
export const print = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

/** Progress and help prose (stderr) — never pollutes --json stdout. */
export const info = (message: string): void => {
  process.stderr.write(`${message}\n`);
};

/** Report a failure on stderr and return the failure exit code. */
export const fail = (message: string): number => {
  process.stderr.write(`error: ${message}\n`);
  return 1;
};

/** The single JSON object a --json invocation emits on stdout. */
export const emitJson = (value: unknown): void => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};
