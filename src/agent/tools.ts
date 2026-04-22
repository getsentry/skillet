import { Type } from "@mariozechner/pi-ai";
import type { Tool } from "@mariozechner/pi-ai";
import { execSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, resolve, dirname, relative } from "node:path";

/**
 * Tool definitions (schema only) for the eval agent, scoped to a workspace.
 */
export function createToolDefs(): Tool[] {
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
      description: "Read the contents of a file.",
      parameters: Type.Object({
        path: Type.String({
          description: "File path relative to workspace or absolute",
        }),
      }),
    },
    {
      name: "write_file",
      description:
        "Write content to a file. Creates parent directories if needed.",
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
      description: "List files in a directory.",
      parameters: Type.Object({
        path: Type.Optional(
          Type.String({
            description: "Directory path relative to workspace",
            default: ".",
          })
        ),
      }),
    },
    {
      name: "grep",
      description: "Search for a regex pattern in files under the workspace.",
      parameters: Type.Object({
        pattern: Type.String({ description: "Regex pattern to search for" }),
        path: Type.Optional(
          Type.String({
            description: "Directory or file to search in",
            default: ".",
          })
        ),
      }),
    },
  ];
}

/**
 * Execute a tool call by name. Returns the text result.
 */
export function executeTool(
  workDir: string,
  name: string,
  args: Record<string, any>
): string {
  switch (name) {
    case "bash":
      return execBash(workDir, args.command);
    case "read_file":
      return execReadFile(workDir, args.path);
    case "write_file":
      return execWriteFile(workDir, args.path, args.content);
    case "edit_file":
      return execEditFile(workDir, args.path, args.old_string, args.new_string);
    case "list_files":
      return execListFiles(workDir, args.path ?? ".");
    case "grep":
      return execGrep(workDir, args.pattern, args.path ?? ".");
    default:
      return `Error: unknown tool "${name}"`;
  }
}

// ── Tool implementations ──────────────────────────────────

function execBash(workDir: string, command: string): string {
  try {
    const result = execSync(command, {
      cwd: workDir,
      stdio: "pipe",
      timeout: 60_000,
      env: { ...process.env, HOME: process.env.HOME },
      maxBuffer: 1024 * 1024,
    });
    return result.toString();
  } catch (err: any) {
    const stderr = err.stderr?.toString() ?? "";
    const stdout = err.stdout?.toString() ?? "";
    return `Exit code ${err.status ?? 1}\nstdout: ${stdout}\nstderr: ${stderr}`;
  }
}

function execReadFile(workDir: string, path: string): string {
  const abs = resolve(workDir, path);
  if (!existsSync(abs)) return `Error: file not found: ${path}`;
  try {
    return readFileSync(abs, "utf-8");
  } catch (err: any) {
    return `Error reading file: ${err.message}`;
  }
}

function execWriteFile(
  workDir: string,
  path: string,
  content: string
): string {
  const abs = resolve(workDir, path);
  try {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, "utf-8");
    return `Wrote ${content.length} bytes to ${path}`;
  } catch (err: any) {
    return `Error writing file: ${err.message}`;
  }
}

function execEditFile(
  workDir: string,
  path: string,
  oldString: string,
  newString: string
): string {
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
  } catch (err: any) {
    return `Error editing file: ${err.message}`;
  }
}

function execListFiles(workDir: string, path: string): string {
  const abs = resolve(workDir, path);
  if (!existsSync(abs)) return `Error: directory not found: ${path}`;
  try {
    const entries = collectFiles(abs, abs);
    return entries.join("\n") || "(empty directory)";
  } catch (err: any) {
    return `Error listing files: ${err.message}`;
  }
}

function execGrep(workDir: string, pattern: string, path: string): string {
  try {
    const result = execSync(
      `grep -rn --include='*' "${pattern.replace(/"/g, '\\"')}" "${path}"`,
      {
        cwd: workDir,
        stdio: "pipe",
        timeout: 10_000,
        maxBuffer: 512 * 1024,
      }
    );
    return result.toString() || "(no matches)";
  } catch {
    return "(no matches)";
  }
}

function collectFiles(
  dir: string,
  root: string,
  maxDepth = 4,
  depth = 0
): string[] {
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
}
