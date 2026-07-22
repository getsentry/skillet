import { readdirSync } from "node:fs";

/** Check for one exact-case file or symlink name inside a directory. */
export const hasExactFile = (directory: string, name: string): boolean => {
  try {
    return readdirSync(directory, { withFileTypes: true }).some(
      (entry) => entry.name === name && (entry.isFile() || entry.isSymbolicLink()),
    );
  } catch {
    return false;
  }
};
