import { existsSync } from "node:fs";
import { resolve } from "node:path";

export type CollectInputsResult = { absolute: string[] } | { error: string };

/**
 * Collect repeatable `--input <path>` and `--input=<path>` flags into
 * absolute paths, or return an error string when any path is missing.
 *
 * Used by `create`, `spec init`, and `spec import` so the
 * spec-author research scope is parsed consistently across commands.
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
