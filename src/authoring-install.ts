import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseFrontmatter } from "./skill/frontmatter.js";

const SKILL = "skillet-authoring";
const SOURCE = "getsentry/skillet";
const CURRENT_SPEC_HASH = "f66844f5ca6d";
const REFRESH_COMMAND = `npx -y @sentry/dotagents@latest --user add ${SOURCE} ${SKILL}`;
const INSTALLED_SKILL = `~/.agents/skills/${SKILL}/SKILL.md`;

const tomlString = (block: string, key: string): string | null => {
  const match = new RegExp(`^\\s*${key}\\s*=\\s*["']([^"']+)["']\\s*(?:#.*)?$`, "m").exec(block);
  return match?.[1] ?? null;
};

const managedByDotagents = (toml: string): boolean => {
  const blocks = toml.split(/^\s*\[\[skills\]\]\s*$/m).slice(1);
  return blocks.some((remainder) => {
    const block = remainder.split(/^\s*\[/m, 1)[0] ?? "";
    return tomlString(block, "name") === SKILL && tomlString(block, "source") === SOURCE;
  });
};

/** Direct stale standard installations to refresh before artifact work continues. */
export const authoringRefreshAction = (agentsDir = join(homedir(), ".agents")): string | null => {
  const skillPath = join(agentsDir, "skills", SKILL, "SKILL.md");
  if (!existsSync(skillPath)) return null;

  const { meta } = parseFrontmatter(readFileSync(skillPath, "utf8"));
  const installedHash = meta["spec_hash"];
  if (String(installedHash ?? "") === CURRENT_SPEC_HASH) return null;

  const tomlPath = join(agentsDir, "agents.toml");
  const dotagentsManaged =
    existsSync(tomlPath) && managedByDotagents(readFileSync(tomlPath, "utf8"));
  const refresh = dotagentsManaged
    ? `run '${REFRESH_COMMAND}'`
    : "refresh it using its original installation method";

  return `The installed ${SKILL} instructions are stale for this Skillet release. Before continuing, ${refresh}, read the refreshed ${INSTALLED_SKILL}, then rerun this status command.`;
};
