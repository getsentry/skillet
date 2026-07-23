import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SETUP_TIMEOUT_MS = 30_000;

const gitLocalEnvironmentVariables = (): string[] => {
  return execFileSync("git", ["rev-parse", "--local-env-vars"], {
    encoding: "utf8",
    timeout: SETUP_TIMEOUT_MS,
  })
    .split(/\r?\n/u)
    .filter((name) => name !== "");
};

const setupEnvironment = (): NodeJS.ProcessEnv => {
  const env = { ...process.env };
  // Git hooks export repository-local variables. Setup commands must resolve
  // repositories from the disposable workspace instead of the caller's repo.
  for (const name of gitLocalEnvironmentVariables()) delete env[name];
  return env;
};

export class SetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SetupError";
  }
}

export interface Workspace {
  dir: string;
  cleanup: () => void;
}

export interface WorkspaceOptions {
  skillRoot: string;
  fixture?: string;
  setup?: string;
}

/**
 * Materialize a fresh workspace for one trial (workspace spec):
 * mkdtemp, copy the fixture in, then run the setup script with the
 * workspace as cwd. The script itself lives in a separate tempdir so
 * it can never appear in the workspace contents or its git state.
 */
export const createWorkspace = (opts: WorkspaceOptions): Workspace => {
  const dir = mkdtempSync(join(tmpdir(), "skillet-eval-"));
  const cleanup = (): void => {
    rmSync(dir, { recursive: true, force: true });
  };

  try {
    if (opts.fixture != null) {
      const fixtureDir = join(opts.skillRoot, "evals", "fixtures", opts.fixture);
      cpSync(fixtureDir, dir, { recursive: true });
    }

    if (opts.setup != null && opts.setup.trim() !== "") {
      const scriptDir = mkdtempSync(join(tmpdir(), "skillet-setup-"));
      const scriptPath = join(scriptDir, "setup.sh");
      writeFileSync(scriptPath, opts.setup);
      chmodSync(scriptPath, 0o755);
      try {
        execFileSync("sh", [scriptPath], {
          cwd: dir,
          env: setupEnvironment(),
          stdio: ["ignore", "pipe", "pipe"],
          timeout: SETUP_TIMEOUT_MS,
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new SetupError(`setup script failed: ${detail.slice(0, 500)}`);
      } finally {
        rmSync(scriptDir, { recursive: true, force: true });
      }
    }
  } catch (error) {
    cleanup();
    throw error;
  }

  return { dir, cleanup };
};
