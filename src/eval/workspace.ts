import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";

export interface WorkspaceConfig {
  setup?: string;
  cwd?: string;
}

export interface Workspace {
  /** Absolute path the agent operates in */
  dir: string;
  /** Clean up temp directory (no-op for cwd mode) */
  cleanup(): void;
}

/**
 * Expand environment variables in a string ($VAR or ${VAR}).
 */
function expandEnvVars(input: string): string {
  return input.replace(/\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, braced, plain) => {
    const name = braced || plain;
    return process.env[name] ?? "";
  });
}

/**
 * Create a workspace for an eval case.
 *
 * - `setup` mode: create a temp dir and run the setup script in it.
 * - `cwd` mode: resolve the path (with env var expansion) and use it directly.
 * - no config: create an empty temp dir.
 */
export function createWorkspace(config?: WorkspaceConfig): Workspace {
  // CWD mode
  if (config?.cwd) {
    const expanded = expandEnvVars(config.cwd);
    if (!expanded) {
      throw new SkipError(`workspace cwd: environment variable not set in "${config.cwd}"`);
    }
    const dir = resolve(expanded);
    if (!existsSync(dir)) {
      throw new SkipError(`workspace cwd: path does not exist: ${dir}`);
    }
    return { dir, cleanup() {} };
  }

  // Setup mode (or default empty)
  const dir = mkdtempSync(join(tmpdir(), "skillkit-eval-"));

  if (config?.setup) {
    try {
      execSync(config.setup, {
        cwd: dir,
        stdio: "pipe",
        env: { ...process.env, HOME: process.env.HOME },
        timeout: 30_000,
      });
    } catch (err: any) {
      // Clean up on setup failure
      rmSync(dir, { recursive: true, force: true });
      const stderr = err.stderr?.toString().trim() || err.message;
      throw new Error(`Workspace setup failed: ${stderr}`);
    }
  }

  return {
    dir,
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Thrown when an eval case should be skipped (not failed).
 */
export class SkipError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "SkipError";
  }
}
