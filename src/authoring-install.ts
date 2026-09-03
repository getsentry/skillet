import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseFrontmatter } from "./skill/frontmatter.js";

const SKILL = "skillet-authoring";
const SOURCE = "getsentry/skillet";
const CURRENT_SPEC_HASH = "2758ed731778";
const REINSTALL_COMMAND = `npx -y @sentry/dotagents@latest --user add ${SOURCE} ${SKILL}`;
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

/** Direct stale standard installations to reinstall before artifact work continues. */
export const authoringReinstallAction = (agentsDir = join(homedir(), ".agents")): string | null => {
  const skillPath = join(agentsDir, "skills", SKILL, "SKILL.md");
  if (!existsSync(skillPath)) return null;

  const { meta } = parseFrontmatter(readFileSync(skillPath, "utf8"));
  const installedHash = meta["spec_hash"];
  if (String(installedHash ?? "") === CURRENT_SPEC_HASH) return null;

  const tomlPath = join(agentsDir, "agents.toml");
  const dotagentsManaged =
    existsSync(tomlPath) && managedByDotagents(readFileSync(tomlPath, "utf8"));
  const reinstall = dotagentsManaged
    ? `reinstall ${SKILL} through dotagents by running '${REINSTALL_COMMAND}'`
    : `reinstall ${SKILL} with the same installation method that originally installed it`;

  return `The installed ${SKILL} instructions are stale for this Skillet release. Before continuing, ${reinstall}. To continue in this agent session, read the reinstalled ${INSTALLED_SKILL}; otherwise start a new session. Then rerun this status command.`;
};
