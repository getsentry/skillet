import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface CreateOptions {
  description: string;
  path?: string;
  maxIterations?: number;
}

const parseCreateArgs = (args: string[]): CreateOptions | null => {
  const description = args.find((a) => !a.startsWith("--"));
  if (description == null || description === "") {
    return null;
  }

  const pathFlag = args.find((a) => a.startsWith("--path="));
  const path = pathFlag?.split("=")[1];

  const iterFlag = args.find((a) => a.startsWith("--max-iterations="));
  const maxIterations = iterFlag != null ? parseInt(iterFlag.split("=")[1] ?? "", 10) : undefined;

  return { description, path, maxIterations };
};

export const createCommand = async (args: string[]): Promise<number> => {
  const opts = parseCreateArgs(args);
  if (opts == null) {
    console.error("Usage: skillkit create <description> [--path=./my-skill] [--max-iterations=3]");
    return 1;
  }

  const targetDir = resolve(opts.path ?? opts.description.toLowerCase().replace(/\s+/g, "-"));
  const skillMdPath = join(targetDir, "SKILL.md");

  if (existsSync(skillMdPath)) {
    console.error(`Error: SKILL.md already exists at ${targetDir}`);
    console.error("Use 'skillkit improve' to refine an existing skill.");
    return 1;
  }

  // TODO: call authorSkill({ mode: "create", ... })
  console.log(`create command not yet fully implemented (target: ${targetDir})`);
  return 1;
};
