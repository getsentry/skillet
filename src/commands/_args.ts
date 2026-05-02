import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Look up a single-value flag in argv. Accepts both `--name=value`
 * and `--name value` forms. Pass the bare flag name (e.g. `"path"`
 * for `--path` / `--path=...`).
 */
export const findFlag = (args: string[], flagName: string): string | undefined => {
  const equalsForm = `--${flagName}=`;
  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? "";
    if (a.startsWith(equalsForm)) return a.slice(equalsForm.length);
    if (a === `--${flagName}`) {
      const next = args[i + 1];
      if (next != null && !next.startsWith("--")) return next;
    }
  }
  return undefined;
};

/**
 * Parse an integer-valued single-value flag. Returns `undefined`
 * when the flag is missing or its value isn't a finite integer.
 */
export const findIntFlag = (args: string[], flagName: string): number | undefined => {
  const raw = findFlag(args, flagName);
  if (raw == null) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * Positional args, excluding any value consumed by a known
 * space-form single-value flag. By default skips `--path`/`--input`.
 */
export const findPositional = (
  args: string[],
  spaceValueFlags: string[] = ["path", "input"],
): string[] => {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? "";
    if (a.startsWith("--")) {
      const bareName = a.slice(2).split("=")[0] ?? "";
      if (spaceValueFlags.includes(bareName) && !a.includes("=")) {
        i += 1;
      }
      continue;
    }
    out.push(a);
  }
  return out;
};

export type CollectInputsResult = { absolute: string[] } | { error: string };

/**
 * Collect repeatable `--input <path>` and `--input=<path>` flags
 * into absolute paths, or return an error string when any path is
 * missing on disk. Used by `create`, `spec init`, and `spec import`
 * so the spec-author research scope is parsed consistently.
 */
export const collectInputs = (args: string[]): CollectInputsResult => {
  const inputs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? "";
    if (a === "--input") {
      const next = args[i + 1];
      if (next != null) {
        inputs.push(next);
        i += 1;
      }
      continue;
    }
    if (a.startsWith("--input=")) {
      inputs.push(a.slice("--input=".length));
    }
  }
  const absolute: string[] = [];
  for (const raw of inputs) {
    const abs = resolve(raw);
    if (!existsSync(abs)) return { error: `--input path does not exist: ${raw}` };
    absolute.push(abs);
  }
  return { absolute };
};
