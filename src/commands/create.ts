import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { authorSkill } from "../authoring/loop.js";
import { specFileName } from "../spec/index.js";

export interface CreateOptions {
  description: string;
  path?: string;
  maxIterations?: number;
}

const parseCreateArgs = (args: string[]): CreateOptions | null => {
  const descParts = args.filter((a) => !a.startsWith("--"));
  const description = descParts.join(" ").trim();
  if (description === "") {
    return null;
  }

  const pathFlag = args.find((a) => a.startsWith("--path="));
  const path = pathFlag?.split("=")[1];

  const iterFlag = args.find((a) => a.startsWith("--max-iterations="));
  const maxIterations = iterFlag != null ? parseInt(iterFlag.split("=")[1] ?? "", 10) : undefined;

  const opts: CreateOptions = { description };
  if (path != null) opts.path = path;
  if (maxIterations != null && !Number.isNaN(maxIterations)) opts.maxIterations = maxIterations;
  return opts;
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
  const specPath = join(targetDir, specFileName());
  const skillMdPath = join(targetDir, "SKILL.md");

  if (existsSync(specPath)) {
    console.error(`Error: ${specPath} already exists.`);
    console.error(
      "Use 'skillet improve' to iterate the existing skill, or 'skillet spec refine' to edit the spec.",
    );
    return 1;
  }
  if (existsSync(skillMdPath)) {
    console.error(`Error: SKILL.md already exists at ${targetDir} (no spec.yaml).`);
    console.error(
      "Use 'skillet improve' (auto-imports legacy SKILL.md into a spec) or 'skillet spec import' first.",
    );
    return 1;
  }

  try {
    const result = await authorSkill({
      mode: "create",
      description: opts.description,
      path: targetDir,
      ...(opts.maxIterations != null ? { maxIterations: opts.maxIterations } : {}),
    });

    return result.success ? 0 : 1;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    return 1;
  }
};
