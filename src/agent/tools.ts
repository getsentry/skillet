import { tool } from "ai";
import { z } from "zod";
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
 * Create the tool set for the eval agent, scoped to a workspace directory.
 */
export function createTools(workDir: string) {
  return {
    bash: tool({
      description: "Execute a shell command in the workspace directory.",
      inputSchema: z.object({
        command: z.string().describe("The shell command to execute"),
      }),
      execute: async (args) => {
        try {
          const result = execSync(args.command, {
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
      },
    }),

    read_file: tool({
      description: "Read the contents of a file.",
      inputSchema: z.object({
        path: z.string().describe("File path relative to workspace or absolute"),
      }),
      execute: async (args) => {
        const abs = resolve(workDir, args.path);
        if (!existsSync(abs)) return `Error: file not found: ${args.path}`;
        try {
          return readFileSync(abs, "utf-8");
        } catch (err: any) {
          return `Error reading file: ${err.message}`;
        }
      },
    }),

    write_file: tool({
      description: "Write content to a file. Creates parent directories if needed.",
      inputSchema: z.object({
        path: z.string().describe("File path relative to workspace"),
        content: z.string().describe("The content to write"),
      }),
      execute: async (args) => {
        const abs = resolve(workDir, args.path);
        try {
          mkdirSync(dirname(abs), { recursive: true });
          writeFileSync(abs, args.content, "utf-8");
          return `Wrote ${args.content.length} bytes to ${args.path}`;
        } catch (err: any) {
          return `Error writing file: ${err.message}`;
        }
      },
    }),

    edit_file: tool({
      description:
        "Replace an exact string in a file with new content. The old_string must match exactly.",
      inputSchema: z.object({
        path: z.string().describe("File path relative to workspace"),
        old_string: z.string().describe("Exact text to find and replace"),
        new_string: z.string().describe("Replacement text"),
      }),
      execute: async (args) => {
        const abs = resolve(workDir, args.path);
        if (!existsSync(abs)) return `Error: file not found: ${args.path}`;
        try {
          const content = readFileSync(abs, "utf-8");
          if (!content.includes(args.old_string)) {
            return `Error: old_string not found in ${args.path}`;
          }
          const updated = content.replace(args.old_string, args.new_string);
          writeFileSync(abs, updated, "utf-8");
          return `Edited ${args.path}`;
        } catch (err: any) {
          return `Error editing file: ${err.message}`;
        }
      },
    }),

    list_files: tool({
      description: "List files in a directory.",
      inputSchema: z.object({
        path: z
          .string()
          .default(".")
          .describe("Directory path relative to workspace"),
      }),
      execute: async (args) => {
        const abs = resolve(workDir, args.path);
        if (!existsSync(abs)) return `Error: directory not found: ${args.path}`;
        try {
          const entries = collectFiles(abs, abs);
          return entries.join("\n") || "(empty directory)";
        } catch (err: any) {
          return `Error listing files: ${err.message}`;
        }
      },
    }),

    grep: tool({
      description: "Search for a regex pattern in files under the workspace.",
      inputSchema: z.object({
        pattern: z.string().describe("Regex pattern to search for"),
        path: z
          .string()
          .default(".")
          .describe("Directory or file to search in"),
      }),
      execute: async (args) => {
        try {
          const result = execSync(
            `grep -rn --include='*' "${args.pattern.replace(/"/g, '\\"')}" "${args.path}"`,
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
      },
    }),
  };
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
