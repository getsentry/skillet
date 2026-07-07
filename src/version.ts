import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const isRecord = (v: unknown): v is Record<string, unknown> => {
  return v != null && typeof v === "object" && !Array.isArray(v);
};

const readVersion = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  // Both dist/cli.js and src/version.ts sit one level below the
  // package root, so ../package.json resolves from either.
  const parsed: unknown = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf-8"));
  if (isRecord(parsed) && typeof parsed["version"] === "string") {
    return parsed["version"];
  }
  throw new Error("package.json has no version");
};

export const VERSION = readVersion();
