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
 * Expand environment variables in a string ($VAR or ${VAR}).
 */
const expandEnvVars = (input: string): string => {
  return input.replace(
    /\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (_match: string, braced: string | undefined, plain: string | undefined) => {
      const name = braced ?? plain ?? "";
      return process.env[name] ?? "";
    },
  );
};

/**
 * Create a workspace for an eval case.
 *
 * - `setup` mode: create a temp dir and run the setup script in it.
 * - `cwd` mode: resolve the path (with env var expansion) and use it directly.
 * - no config: create an empty temp dir.
 */
export const createWorkspace = (config?: WorkspaceConfig): Workspace => {
  // CWD mode
  if (config?.cwd != null && config.cwd !== "") {
    const expanded = expandEnvVars(config.cwd);
    if (expanded === "") {
      throw new SkipError(`workspace cwd: environment variable not set in "${config.cwd}"`);
    }
    const dir = resolve(expanded);
    if (!existsSync(dir)) {
      throw new SkipError(`workspace cwd: path does not exist: ${dir}`);
    }
    return { dir, cleanup() {} };
  }

  // Setup mode (or default empty)
  const dir = mkdtempSync(join(tmpdir(), "skillet-eval-"));

  if (config?.setup != null && config.setup !== "") {
    try {
      execSync(config.setup, {
        cwd: dir,
        stdio: "pipe",
        env: { ...process.env, HOME: process.env.HOME },
        timeout: 30_000,
      });
    } catch (err: unknown) {
      // Clean up on setup failure
      rmSync(dir, { recursive: true, force: true });
      let stderr: string;
      if (isExecError(err)) {
        const fromStderr = err.stderr?.toString().trim() ?? "";
        stderr = fromStderr !== "" ? fromStderr : errorMessage(err);
      } else {
        stderr = errorMessage(err);
      }
      throw new Error(`Workspace setup failed: ${stderr}`, { cause: err });
    }
  }

  return {
    dir,
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
};

/**
 * Thrown when an eval case should be skipped (not failed).
 */
export class SkipError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "SkipError";
  }
}
