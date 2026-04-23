import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, basename, join } from "node:path";
import { parse as parseYaml } from "yaml";

export interface SkillMeta {
  name: string;
  description: string;
  allowedTools?: string[];
  [key: string]: unknown;
}

export interface Skill {
  root: string;
  meta: SkillMeta;
  body: string;
}

/**
 * Walk up from `startPath` to find the nearest directory containing SKILL.md.
 */
export const findSkillRoot = (startPath: string): string => {
  let dir = resolve(startPath);
  for (let i = 0; i < 50; i++) {
    if (existsSync(join(dir, "SKILL.md"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`No SKILL.md found starting from ${startPath}`);
};

const isRecord = (v: unknown): v is Record<string, unknown> => {
  return v != null && typeof v === "object" && !Array.isArray(v);
};

/**
 * Parse YAML frontmatter delimited by --- lines.
 * Returns { meta, body } where body is everything after the closing ---.
 */
const parseFrontmatter = (
  content: string,
): {
  meta: Record<string, unknown>;
  body: string;
} => {
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
    if (isRecord(parsed)) {
      return { meta: parsed, body };
    }
    return { meta: {}, body };
  } catch {
    return { meta: {}, body: content };
  }
};

const metaString = (meta: Record<string, unknown>, key: string): string | undefined => {
  const v = meta[key];
  return typeof v === "string" ? v : undefined;
};

const parseAllowedTools = (meta: Record<string, unknown>): string[] | undefined => {
  const raw = meta["allowed-tools"];
  if (raw == null) return undefined;

  if (Array.isArray(raw)) {
    const list: string[] = [];
    for (const item of raw) {
      if (typeof item === "string") list.push(item.trim());
    }
    return list;
  }

  if (typeof raw === "string") {
    return raw.split(",").map((t) => t.trim());
  }

  return undefined;
};

/**
 * Load a skill from its root directory.
 */
export const loadSkill = (skillRoot: string): Skill => {
  const skillPath = join(skillRoot, "SKILL.md");
  if (!existsSync(skillPath)) {
    throw new Error(`SKILL.md not found at ${skillPath}`);
  }

  const raw = readFileSync(skillPath, "utf-8");
  const { meta, body } = parseFrontmatter(raw);

  const name = metaString(meta, "name") ?? basename(skillRoot);
  const description = metaString(meta, "description") ?? "";
  const allowedTools = parseAllowedTools(meta);

  const result: SkillMeta = { ...meta, name, description };
  if (allowedTools != null) {
    result.allowedTools = allowedTools;
  }

  return {
    root: resolve(skillRoot),
    meta: result,
    body,
  };
};
