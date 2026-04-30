/**
 * Help-flag detection for command entry points. Every command must
 * short-circuit on `--help` / `-h` before validating paths, reading
 * files, invoking the LLM, or writing sessions — otherwise
 * `skillet improve --help` runs an actual import flow.
 */
export const isHelpRequest = (args: string[]): boolean => {
  return args.includes("--help") || args.includes("-h");
};
