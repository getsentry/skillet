import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { findSkillRoot } from "../skill/frontmatter.js";
import { fail } from "../output.js";

/**
 * Resolve the skill root from an optional positional path (default:
 * cwd). Returns null after printing an error when no skill is found.
 */
export const resolveSkillRoot = (positional: string | undefined): string | null => {
  const start = resolve(positional ?? ".");
  if (!existsSync(start)) {
    fail(`no such path: ${start}`);
    return null;
  }
  const root = findSkillRoot(start);
  if (root == null) {
    fail(
      `no skill found at or above ${start} — a skill directory contains spec.md (or a legacy SKILL.md). Start one with 'skillet new <name>'.`,
    );
    return null;
  }
  return root;
};
