import { Type } from "@mariozechner/pi-ai";
import type { Tool } from "@mariozechner/pi-ai";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { sanitizedProcessEnv } from "../eval/env.js";

/**
 * Type guard for errors thrown by execSync that carry status/stderr/stdout.
 */
const isExecError = (
  err: unknown,
): err is { status: number | null; stderr: Buffer | null; stdout: Buffer | null } => {
  return err != null && typeof err === "object" && "status" in err;
};

const errorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return JSON.stringify(err);
};

/**
 * Extract a string argument from a tool-call args record. Returns `fallback`
 * if the value is missing or not a string (avoids `[object Object]` coercion).
 */
const stringArg = (args: Record<string, unknown>, key: string, fallback = ""): string => {
  const v = args[key];
  return typeof v === "string" ? v : fallback;
};

/**
 * Tool definitions (schema only) for the eval agent, scoped to a workspace.
 */
export const createToolDefs = (): Tool[] => {
  return [
    {
      name: "bash",
      description: "Execute a shell command in the workspace directory.",
      parameters: Type.Object({
        command: Type.String({ description: "The shell command to execute" }),
      }),
    },
    {
      name: "read_file",
      description:
        "Read the contents of a file. Paths are relative to the workspace; skill reference files under references/*.md are also readable by their relative path.",
      parameters: Type.Object({
        path: Type.String({
          description: "File path relative to workspace, absolute path, or references/<name>.md",
        }),
      }),
    },
    {
      name: "write_file",
      description: "Write content to a file. Creates parent directories if needed.",
      parameters: Type.Object({
        path: Type.String({ description: "File path relative to workspace" }),
        content: Type.String({ description: "The content to write" }),
      }),
    },
    {
      name: "edit_file",
      description:
        "Replace an exact string in a file with new content. The old_string must match exactly.",
      parameters: Type.Object({
        path: Type.String({ description: "File path relative to workspace" }),
        old_string: Type.String({
          description: "Exact text to find and replace",
        }),
        new_string: Type.String({ description: "Replacement text" }),
      }),
    },
    {
      name: "list_files",
      description:
        "List files in a directory. Use path='references' to list skill reference files when available.",
      parameters: Type.Object({
        path: Type.Optional(
          Type.String({
            description: "Directory path relative to workspace",
            default: ".",
          }),
        ),
      }),
    },
    {
      name: "grep",
      description:
        "Search for a regex pattern in files under the workspace. Skill references under references/*.md are searchable by using path='references' or an exact references/<name>.md path.",
      parameters: Type.Object({
        pattern: Type.String({ description: "Regex pattern to search for" }),
        path: Type.Optional(
          Type.String({
            description: "Directory or file to search in",
            default: ".",
          }),
        ),
      }),
    },
  ];
};

/**
 * Execute a tool call by name. Returns the text result.
 */
export const executeTool = (
  workDir: string,
  name: string,
  args: Record<string, unknown>,
  skillRoot?: string,
): string => {
  switch (name) {
    case "bash":
      return execBash(workDir, stringArg(args, "command"));
    case "read_file":
      return execReadFile(workDir, stringArg(args, "path"), skillRoot);
    case "write_file":
      return execWriteFile(workDir, stringArg(args, "path"), stringArg(args, "content"));
    case "edit_file":
      return execEditFile(
        workDir,
        stringArg(args, "path"),
        stringArg(args, "old_string"),
        stringArg(args, "new_string"),
      );
    case "list_files":
      return execListFiles(workDir, stringArg(args, "path", "."), skillRoot);
    case "grep":
      return execGrep(workDir, stringArg(args, "pattern"), stringArg(args, "path", "."), skillRoot);
    default:
      return `Error: unknown tool "${name}"`;
  }
};

// ── Tool implementations ──────────────────────────────────

const execBash = (workDir: string, command: string): string => {
  try {
    const result = execSync(command, {
      cwd: workDir,
      stdio: "pipe",
      timeout: 60_000,
      env: sanitizedProcessEnv(),
      maxBuffer: 1024 * 1024,
    });
    return result.toString();
  } catch (err: unknown) {
    if (isExecError(err)) {
      const stderr = err.stderr?.toString() ?? "";
      const stdout = err.stdout?.toString() ?? "";
      return `Exit code ${err.status ?? 1}\nstdout: ${stdout}\nstderr: ${stderr}`;
    }
    return `Exit code 1\nstdout: \nstderr: ${errorMessage(err)}`;
  }
};

const execReadFile = (workDir: string, path: string, skillRoot?: string): string => {
  const abs = resolveReadablePath(workDir, path, skillRoot);
  if (!existsSync(abs)) return `Error: file not found: ${path}`;
  try {
    return readFileSync(abs, "utf-8");
  } catch (err: unknown) {
    return `Error reading file: ${errorMessage(err)}`;
  }
};

const execWriteFile = (workDir: string, path: string, content: string): string => {
  const abs = resolve(workDir, path);
  try {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, "utf-8");
    return `Wrote ${content.length} bytes to ${path}`;
  } catch (err: unknown) {
    return `Error writing file: ${errorMessage(err)}`;
  }
};

const execEditFile = (
  workDir: string,
  path: string,
  oldString: string,
  newString: string,
): string => {
  const abs = resolve(workDir, path);
  if (!existsSync(abs)) return `Error: file not found: ${path}`;
  try {
    const content = readFileSync(abs, "utf-8");
    if (!content.includes(oldString)) {
      return `Error: old_string not found in ${path}`;
    }
    const updated = content.replace(oldString, newString);
    writeFileSync(abs, updated, "utf-8");
    return `Edited ${path}`;
  } catch (err: unknown) {
    return `Error editing file: ${errorMessage(err)}`;
  }
};

const execListFiles = (workDir: string, path: string, skillRoot?: string): string => {
  const abs = resolveReadablePath(workDir, path, skillRoot);
  if (!existsSync(abs)) return `Error: directory not found: ${path}`;
  try {
    const entries = collectFiles(abs, abs);
    return entries.join("\n") || "(empty directory)";
  } catch (err: unknown) {
    return `Error listing files: ${errorMessage(err)}`;
  }
};

const execGrep = (workDir: string, pattern: string, path: string, skillRoot?: string): string => {
  const abs = resolveReadablePath(workDir, path, skillRoot);
  try {
    const result = execSync(`grep -rn --include='*' "${pattern.replace(/"/g, '\\"')}" "${abs}"`, {
      cwd: workDir,
      stdio: "pipe",
      timeout: 10_000,
      maxBuffer: 512 * 1024,
    });
    return result.toString() || "(no matches)";
  } catch {
    return "(no matches)";
  }
};

const isSkillReferencePath = (path: string): boolean => {
  return path === "references" || /^references\/[a-z][a-z0-9-]*\.md$/.test(path);
};

const resolveReadablePath = (workDir: string, path: string, skillRoot?: string): string => {
  if (skillRoot != null && isSkillReferencePath(path)) {
    const skillPath = resolve(skillRoot, path);
    if (existsSync(skillPath)) return skillPath;
  }
  return resolve(workDir, path);
};

const collectFiles = (dir: string, root: string, maxDepth = 4, depth = 0): string[] => {
  if (depth > maxDepth) return [];
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith(".")) continue;
      const full = join(dir, entry);
      const rel = relative(root, full);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        results.push(rel + "/");
        results.push(...collectFiles(full, root, maxDepth, depth + 1));
      } else {
        results.push(rel);
      }
    }
  } catch {
    // skip inaccessible
  }
  return results;
};
