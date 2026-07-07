/**
 * Output conventions (cli spec, "JSON output convention"):
 * - `--json` mode emits exactly one JSON object on stdout, no ANSI.
 * - Human-readable prose always goes to stderr.
 * - Exit codes: 0 success, 1 failure.
 */

export const info = (message: string): void => {
  process.stderr.write(`${message}\n`);
};

export const fail = (message: string): number => {
  process.stderr.write(`error: ${message}\n`);
  return 1;
};

export const emitJson = (value: unknown): void => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};
