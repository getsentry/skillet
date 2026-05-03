/**
 * Skillet's agent tools as a `PiAiToolset` for upstream
 * `@vitest-evals/harness-pi-ai`. Each tool's `execute(args, ctx)`
 * delegates to the existing implementation in
 * `src/agent/tools.ts`, reading the workspace cwd from
 * `ctx.metadata.cwd` (set by `createWorkspace` in generated
 * eval files).
 *
 * File-writing tools (`write_file`, `edit_file`) call
 * `ctx.setArtifact(path, content)` so the post-write content
 * surfaces on `HarnessRun.artifacts` natively — judges grade
 * the deliverable file, not just the chat transcript.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PiAiToolset } from "@vitest-evals/harness-pi-ai";
import { executeTool } from "../agent/tools.js";

type SkilletToolMetadata = {
  /** Absolute workspace directory the agent runs in. */
  cwd?: string;
} & Record<string, unknown>;

export interface SkilletToolsOptions {
  /**
   * Skill root directory; tools that read files (read_file,
   * list_files, grep) resolve `references/<name>.md` against
   * this path so the agent can pull in skill references.
   */
  skillRoot: string;
}

const cwdFromMetadata = (metadata: Readonly<SkilletToolMetadata>): string => {
  const cwd = metadata.cwd;
  if (typeof cwd !== "string" || cwd === "") {
    throw new Error(
      "skilletTools: `cwd` missing from harness metadata. Pass `metadata: { cwd }` to `run(...)`.",
    );
  }
  return cwd;
};

const stringArg = (args: Record<string, unknown>, key: string, fallback = ""): string => {
  const v = args[key];
  return typeof v === "string" ? v : fallback;
};

/**
 * Build the `PiAiToolset` skillet's eval agent uses. `skillRoot`
 * is bound at construction time (used to resolve
 * `references/<name>.md`); the workspace cwd flows in through
 * each tool call's `ctx.metadata.cwd`.
 */
export const skilletTools = (opts: SkilletToolsOptions): PiAiToolset => {
  const { skillRoot } = opts;
  // SkilletToolMetadata is structurally identical to HarnessMetadata
  // (Record<string, unknown>), so the upstream default suffices for
  // the `PiAiToolset` type arg — we cast metadata inside each execute
  // for the cwd narrowing.
  return {
    bash: {
      description: "Execute a shell command in the workspace directory.",
      execute: (args, ctx) =>
        executeTool(cwdFromMetadata(ctx.metadata as SkilletToolMetadata), "bash", args, skillRoot),
    },
    read_file: {
      description:
        "Read the contents of a file. Paths are relative to the workspace; skill reference files under references/*.md are also readable by their relative path.",
      execute: (args, ctx) =>
        executeTool(
          cwdFromMetadata(ctx.metadata as SkilletToolMetadata),
          "read_file",
          args,
          skillRoot,
        ),
    },
    write_file: {
      description: "Write content to a file. Creates parent directories if needed.",
      execute: (args, ctx) => {
        const cwd = cwdFromMetadata(ctx.metadata as SkilletToolMetadata);
        const path = stringArg(args, "path");
        const result = executeTool(cwd, "write_file", args, skillRoot);
        if (path !== "") {
          const abs = resolve(cwd, path);
          if (existsSync(abs)) ctx.setArtifact(path, readFileSync(abs, "utf-8"));
        }
        return result;
      },
    },
    edit_file: {
      description:
        "Replace an exact string in a file with new content. The old_string must match exactly.",
      execute: (args, ctx) => {
        const cwd = cwdFromMetadata(ctx.metadata as SkilletToolMetadata);
        const path = stringArg(args, "path");
        const result = executeTool(cwd, "edit_file", args, skillRoot);
        if (path !== "") {
          const abs = resolve(cwd, path);
          if (existsSync(abs)) ctx.setArtifact(path, readFileSync(abs, "utf-8"));
        }
        return result;
      },
    },
    list_files: {
      description:
        "List files in a directory. Use path='references' to list skill reference files when available.",
      execute: (args, ctx) =>
        executeTool(
          cwdFromMetadata(ctx.metadata as SkilletToolMetadata),
          "list_files",
          args,
          skillRoot,
        ),
    },
    grep: {
      description:
        "Search for a regex pattern in files under the workspace. Skill references under references/*.md are searchable.",
      execute: (args, ctx) =>
        executeTool(cwdFromMetadata(ctx.metadata as SkilletToolMetadata), "grep", args, skillRoot),
    },
  };
};
