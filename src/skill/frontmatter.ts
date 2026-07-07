import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

const isRecord = (v: unknown): v is Record<string, unknown> => {
  return v != null && typeof v === "object" && !Array.isArray(v);
};

/**
 * Parse YAML frontmatter delimited by --- lines.
 * Returns { meta, body } where body is everything after the closing ---.
 */
export const parseFrontmatter = (
  content: string,
): { meta: Record<string, unknown>; body: string } => {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) {
    return { meta: {}, body: content };
  }
  const end = trimmed.indexOf("\n---", 3);
  if (end === -1) {
    return { meta: {}, body: content };
  }
  const yamlBlock = trimmed.slice(3, end).trim();
  const body = trimmed.slice(end + 4).trimStart();
  try {
    const parsed: unknown = parseYaml(yamlBlock);
    return { meta: isRecord(parsed) ? parsed : {}, body };
  } catch {
    return { meta: {}, body: content };
  }
};

/**
 * Walk up from `startPath` to the nearest directory containing spec.md
 * or SKILL.md (skill-loader spec, "Skill Directory Structure").
 */
export const findSkillRoot = (startPath: string): string | null => {
  let dir = resolve(startPath);
  for (let i = 0; i < 50; i++) {
    if (existsSync(join(dir, "spec.md")) || existsSync(join(dir, "SKILL.md"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
};
