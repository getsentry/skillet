import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, sep } from "node:path";
import { parseFrontmatter } from "../skill/frontmatter.js";
import { slugify } from "../spec/slug.js";
import { type ResolvedHarness } from "./types.js";

export interface Installation {
  /** Directories to remove when the trial finishes (outside the workspace). */
  cleanup: () => void;
}

const NOOP: Installation = { cleanup: () => {} };

const skillSlug = (skillRoot: string): string => {
  const raw = readFileSync(join(skillRoot, "SKILL.md"), "utf8");
  const { meta } = parseFrontmatter(raw);
  const name = typeof meta["name"] === "string" ? meta["name"] : basename(skillRoot);
  return slugify(name) || "skill";
};

/**
 * Copy the skill for installation, excluding the top-level evals/
 * directory — if cases and fixtures were installed alongside the
 * skill, the agent under test could read its own grading criteria.
 */
const copySkill = (skillRoot: string, dest: string): void => {
  cpSync(skillRoot, dest, {
    recursive: true,
    filter: (src) => {
      const rel = relative(skillRoot, src);
      return rel !== "evals" && !rel.startsWith(`evals${sep}`);
    },
  });
};

/**
 * Make the skill discoverable by the spawned agent, each harness using
 * that agent's native mechanism (harness spec, "Skill installation
 * into the harness"):
 *
 * - claude: project skills under `.claude/skills/<slug>/` in the workspace.
 * - codex: no native skill support, so the SKILL.md body becomes the
 *   workspace `AGENTS.md`; the full skill directory is staged outside
 *   the workspace and referenced by absolute path so relative
 *   `references/` links keep working.
 * - custom: copied into the configured `skill_dir` template, or
 *   `.skillet/skill/` in the workspace when none is set.
 */
export const installSkill = (
  harness: ResolvedHarness,
  skillRoot: string,
  workspace: string,
): Installation => {
  if (harness.kind === "claude") {
    const dest = join(workspace, ".claude", "skills", skillSlug(skillRoot));
    mkdirSync(dest, { recursive: true });
    copySkill(skillRoot, dest);
    return NOOP;
  }

  if (harness.kind === "codex") {
    const staged = mkdtempSync(join(tmpdir(), "skillet-skill-"));
    copySkill(skillRoot, staged);
    const raw = readFileSync(join(skillRoot, "SKILL.md"), "utf8");
    const { body } = parseFrontmatter(raw);
    const agentsMd = [
      "The following skill applies to all work in this directory. Follow it.",
      `Its bundled files live at ${staged}/ — relative \`references/\` paths in the text resolve there.`,
      "",
      "---",
      "",
      body,
    ].join("\n");
    writeFileSync(join(workspace, "AGENTS.md"), agentsMd);
    return {
      cleanup: () => {
        rmSync(staged, { recursive: true, force: true });
      },
    };
  }

  const template = harness.skillDir ?? join("{workspace}", ".skillet", "skill");
  const dest = template.replaceAll("{workspace}", workspace);
  mkdirSync(dest, { recursive: true });
  copySkill(skillRoot, dest);
  return NOOP;
};
