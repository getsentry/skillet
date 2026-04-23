import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { authorSkill } from "../authoring/loop.js";

export interface CreateOptions {
  description: string;
  path?: string;
  maxIterations?: number;
}

const parseCreateArgs = (args: string[]): CreateOptions | null => {
  // Collect all non-flag args as the description
  const descParts = args.filter((a) => !a.startsWith("--"));
  const description = descParts.join(" ").trim();
  if (description === "") {
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
    console.error("Usage: skillet create <description> [--path=./my-skill] [--max-iterations=3]");
    return 1;
  }

  const targetDir = resolve(
    opts.path ?? opts.description.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  );
  const skillMdPath = join(targetDir, "SKILL.md");

  if (existsSync(skillMdPath)) {
    console.error(`Error: SKILL.md already exists at ${targetDir}`);
    console.error("Use 'skillet improve' to refine an existing skill.");
    return 1;
  }

  try {
    const result = await authorSkill({
      mode: "create",
      description: opts.description,
      path: targetDir,
      maxIterations: opts.maxIterations,
    });

    return result.success ? 0 : 1;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    return 1;
  }
};
