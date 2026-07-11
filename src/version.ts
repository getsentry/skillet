import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isRecord } from "./guards.js";

const readVersion = (): string => {
  const here = import.meta.dirname;
  // Both dist/cli.js and src/version.ts sit one level below the
  // package root, so ../package.json resolves from either.
  const parsed: unknown = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8"));
  if (isRecord(parsed) && typeof parsed["version"] === "string") {
    return parsed["version"];
  }
  throw new Error("package.json has no version");
};

export const VERSION = readVersion();
