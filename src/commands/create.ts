import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { authorSkill } from "../authoring/loop.js";
import { SpecAuthorPaused } from "../authoring/phases/spec-author.js";
import { sessionExists } from "../authoring/session.js";
import { handleSpecAuthorPause } from "../cli/pause.js";
import { specFileName } from "../spec/index.js";
import { collectInputs } from "./_inputs.js";

/** Default `allowed-tools` for fresh skills. Permissive enough that
 *  authoring workflows aren't blocked by permission prompts on the
 *  first run; intentionally excludes destructive/network tools. */
export const DEFAULT_ALLOWED_TOOLS = "Read Grep Glob Bash Edit Write";

export interface CreateOptions {
  description: string;
  path?: string;
  maxIterations?: number;
  /**
   * Allowed-tools value for the SKILL.md frontmatter. `undefined`
   * uses the default; an explicit empty string means "no allowed-tools
   * line at all" (set by `--no-default-tools`).
   */
  allowedTools?: string;
  noDefaultTools?: boolean;
}

const parseCreateArgs = (args: string[]): CreateOptions | null => {
  // Strip flags that take a value before treating remaining tokens as
  // free-form description words. `--tools "Read Grep"` is two tokens
  // in argv: `--tools` and `Read Grep`.
  const desc: string[] = [];
  let i = 0;
  let path: string | undefined;
  let maxIterations: number | undefined;
  let allowedTools: string | undefined;
  let noDefaultTools = false;
  while (i < args.length) {
    const a = args[i] ?? "";
    if (a === "--no-default-tools") {
      noDefaultTools = true;
      i += 1;
      continue;
    }
    if (a === "--tools") {
      const next = args[i + 1];
      if (next != null && !next.startsWith("--")) {
        allowedTools = next;
        i += 2;
        continue;
      }
    }
    if (a.startsWith("--tools=")) {
      allowedTools = a.slice("--tools=".length);
      i += 1;
      continue;
    }
    if (a === "--path") {
      const next = args[i + 1];
      if (next != null && !next.startsWith("--")) {
        path = next;
        i += 2;
        continue;
      }
    }
    if (a.startsWith("--path=")) {
      path = a.slice("--path=".length);
      i += 1;
      continue;
    }
    if (a === "--input") {
      // Skip flag + value; collectInputs() parses the flag separately.
      i += 2;
      continue;
    }
    if (a.startsWith("--input=")) {
      i += 1;
      continue;
    }
    if (a === "--max-iterations") {
      const next = args[i + 1];
      if (next != null && !next.startsWith("--")) {
        const n = Number.parseInt(next, 10);
        if (!Number.isNaN(n)) maxIterations = n;
        i += 2;
        continue;
      }
    }
    if (a.startsWith("--max-iterations=")) {
      const n = Number.parseInt(a.slice("--max-iterations=".length), 10);
      if (!Number.isNaN(n)) maxIterations = n;
      i += 1;
      continue;
    }
    if (a.startsWith("--")) {
      // Unknown flag — skip silently rather than treat as description.
      i += 1;
      continue;
    }
    desc.push(a);
    i += 1;
  }
  const description = desc.join(" ").trim();
  if (description === "") {
    return null;
  }

  const opts: CreateOptions = { description };
  if (path != null) opts.path = path;
  if (maxIterations != null) opts.maxIterations = maxIterations;
  if (allowedTools != null) opts.allowedTools = allowedTools;
  if (noDefaultTools) opts.noDefaultTools = true;
  return opts;
};

export const createCommand = async (args: string[]): Promise<number> => {
  const opts = parseCreateArgs(args);
  if (opts == null) {
    console.error(
      'Usage: skillet create <description> [--path <dir>] [--max-iterations N] [--tools "Read Grep ..."] [--no-default-tools] [--input <dir>]...',
    );
    return 1;
  }

  const inputs = collectInputs(args);
  if ("error" in inputs) {
    console.error(`Error: ${inputs.error}`);
    return 1;
  }
  const inputAbsolutes = inputs.absolute;

  // Resolve the allowed-tools value for the new skill's frontmatter.
  // Default: a permissive Claude Code subset. --tools overrides;
  // --no-default-tools omits the field entirely.
  let allowedTools: string | undefined;
  if (opts.noDefaultTools !== true) {
    allowedTools = opts.allowedTools ?? DEFAULT_ALLOWED_TOOLS;
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
  if (sessionExists(targetDir)) {
    console.error(`Error: a paused spec-author session exists at ${targetDir}.`);
    console.error("Resume it with `skillet resume` or delete `.skillet-session.json` first.");
    return 1;
  }

  try {
    const authorOpts: Parameters<typeof authorSkill>[0] = {
      mode: "create",
      description: opts.description,
      path: targetDir,
    };
    if (opts.maxIterations != null) authorOpts.maxIterations = opts.maxIterations;
    if (allowedTools != null) authorOpts.allowedTools = allowedTools;
    if (inputAbsolutes.length > 0) authorOpts.inputPaths = inputAbsolutes;
    const result = await authorSkill(authorOpts);
    return result.success ? 0 : 1;
  } catch (err: unknown) {
    if (err instanceof SpecAuthorPaused) {
      const pauseInput: Parameters<typeof handleSpecAuthorPause>[0] = {
        err,
        skillRoot: targetDir,
        seedKind: "from-description",
        seedInput: opts.description,
      };
      if (allowedTools != null) pauseInput.allowedTools = allowedTools;
      if (inputAbsolutes.length > 0) pauseInput.inputPaths = inputAbsolutes;
      return handleSpecAuthorPause(pauseInput);
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    return 1;
  }
};
