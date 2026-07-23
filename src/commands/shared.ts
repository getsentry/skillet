import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { CURRENT_SKILLET } from "../invocation.js";
import { findSkillRoot } from "../skill/frontmatter.js";
import { fail } from "../output.js";

/** The shared no-skill failure message, also used by status's own resolution. */
export const noSkillMessage = (start: string): string =>
  `no skill found at or above ${start} — a skill directory contains spec.md (or a legacy SKILL.md). Start one with '${CURRENT_SKILLET} new <name>'.`;

/**
 * Resolve the skill root from an optional positional path (default:
 * cwd). Returns null after printing an error when no skill is found.
 */
export const resolveSkillRoot = (
  positional: string | undefined,
  opts?: { json?: boolean },
): string | null => {
  const start = resolve(positional ?? ".");
  if (!existsSync(start)) {
    fail(`no such path: ${start}`, opts);
    return null;
  }
  const root = findSkillRoot(start);
  if (root == null) {
    fail(noSkillMessage(start), opts);
    return null;
  }
  return root;
};
