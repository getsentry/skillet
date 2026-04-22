import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
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
export function findSkillRoot(startPath: string): string {
  let dir = resolve(startPath);
  for (let i = 0; i < 50; i++) {
    if (existsSync(join(dir, "SKILL.md"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`No SKILL.md found starting from ${startPath}`);
}

/**
 * Parse YAML frontmatter delimited by --- lines.
 * Returns { meta, body } where body is everything after the closing ---.
 */
function parseFrontmatter(content: string): {
  meta: Record<string, unknown>;
  body: string;
} {
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
    const parsed = parseYaml(yamlBlock);
    return { meta: typeof parsed === "object" && parsed !== null ? parsed : {}, body };
  } catch {
    return { meta: {}, body: content };
  }
}

/**
 * Load a skill from its root directory.
 */
export function loadSkill(skillRoot: string): Skill {
  const skillPath = join(skillRoot, "SKILL.md");
  if (!existsSync(skillPath)) {
    throw new Error(`SKILL.md not found at ${skillPath}`);
  }

  const raw = readFileSync(skillPath, "utf-8");
  const { meta, body } = parseFrontmatter(raw);

  const name = (meta.name as string) || basename(skillRoot);
  const description = (meta.description as string) || "";
  const allowedTools = meta["allowed-tools"]
    ? String(meta["allowed-tools"])
        .split(",")
        .map((t) => t.trim())
    : undefined;

  return {
    root: resolve(skillRoot),
    meta: { ...meta, name, description, allowedTools },
    body,
  };
}
