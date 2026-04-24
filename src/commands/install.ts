import { existsSync, mkdirSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

/**
 * Known agent skill directories, checked in order.
 * The first one that exists (or whose parent exists) wins.
 */
const AGENT_SKILL_DIRS: Array<{
  name: string;
  dir: string;
}> = [
  { name: "Claude Code", dir: join(homedir(), ".claude", "skills") },
  { name: "OpenCode", dir: join(homedir(), ".opencode", "skills") },
  { name: "Pi", dir: join(homedir(), ".pi", "agent", "skills") },
];

const resolveSkillSource = (): string => {
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = dirname(thisFile);

  // From dist/ (bundled)
  const fromDist = join(thisDir, "..", "skills", "skillet");
  if (existsSync(fromDist)) {
    return fromDist;
  }

  // From src/ (development)
  const fromSrc = join(thisDir, "..", "..", "skills", "skillet");
  if (existsSync(fromSrc)) {
    return fromSrc;
  }

  // From cwd
  const fromCwd = join(process.cwd(), "skills", "skillet");
  if (existsSync(fromCwd)) {
    return fromCwd;
  }

  throw new Error("Cannot find bundled skillet skill. Package may be corrupted.");
};

const detectAgentDir = (): { name: string; dir: string } | undefined => {
  for (const entry of AGENT_SKILL_DIRS) {
    if (existsSync(entry.dir)) {
      return entry;
    }
  }
  // Check if parent exists (skill dir just hasn't been created yet)
  for (const entry of AGENT_SKILL_DIRS) {
    const parent = dirname(entry.dir);
    if (existsSync(parent)) {
      return entry;
    }
  }
  return undefined;
};

export const installCommand = (args: string[]): number => {
  const explicitPath = args.find((a) => !a.startsWith("--"));

  let targetDir: string;
  let agentName: string;

  if (explicitPath != null && explicitPath !== "") {
    targetDir = join(explicitPath, "skillet");
    agentName = "custom path";
  } else {
    const detected = detectAgentDir();
    if (detected == null) {
      console.error("Could not detect an agent skill directory.");
      console.error("Checked:");
      for (const entry of AGENT_SKILL_DIRS) {
        console.error(`  ${entry.name}: ${entry.dir}`);
      }
      console.error("\nSpecify a path explicitly: skillet install <path>");
      return 1;
    }
    targetDir = join(detected.dir, "skillet");
    agentName = detected.name;
  }

  const source = resolveSkillSource();

  if (existsSync(targetDir)) {
    console.log(`Updating existing skill at ${targetDir}`);
  } else {
    console.log(`Installing skillet skill for ${agentName}`);
  }

  mkdirSync(targetDir, { recursive: true });
  cpSync(source, targetDir, { recursive: true });

  console.log(`\x1b[32m✓\x1b[0m Installed to ${targetDir}`);
  return 0;
};
