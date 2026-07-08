import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { isRecord } from "../guards.js";
import { HarnessConfigError } from "./config.js";
import type { ResolvedHarness } from "./types.js";

/** Paths inside the container; the host workspace/scratch mount here. */
export const CONTAINER_WORKSPACE = "/workspace";
export const CONTAINER_SCRATCH = "/scratch";

export interface SandboxConfig {
  image: string;
  /** Host dirs/files mounted into the container home for harness auth. */
  mountAuth: string[];
  network: boolean;
  /** Environment variable names passed through from the host. */
  env: string[];
}

export const DEFAULT_IMAGE = "skillet-eval";
const DEFAULT_AUTH_CANDIDATES = ["~/.codex", "~/.claude", "~/.claude.json"];

const expandHome = (path: string): string => {
  return path.startsWith("~") ? join(homedir(), path.slice(1)) : path;
};

const stringList = (value: unknown, field: string): string[] => {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new HarnessConfigError(`sandbox "${field}" must be a list of strings`);
  }
  return value.filter((v): v is string => typeof v === "string");
};

/**
 * Resolve the sandbox for a run from the loaded .skillet.yaml config:
 * `--sandbox docker|none` overrides the `sandbox:` block's `enabled`
 * value. Returns null when the run is direct (the default — trusting
 * the skill under eval).
 */
export const resolveSandbox = (
  config: Record<string, unknown>,
  flag?: string,
): SandboxConfig | null => {
  if (flag != null && flag !== "docker" && flag !== "none") {
    throw new HarnessConfigError('--sandbox accepts "docker" or "none"');
  }

  const raw = config["sandbox"];
  const block: Record<string, unknown> = isRecord(raw) ? raw : {};

  const enabled = flag != null ? flag === "docker" : block["enabled"] === true;
  if (!enabled) return null;

  const image = typeof block["image"] === "string" ? block["image"] : DEFAULT_IMAGE;
  const mountAuth =
    block["mount_auth"] != null
      ? stringList(block["mount_auth"], "mount_auth").map(expandHome)
      : DEFAULT_AUTH_CANDIDATES.map(expandHome).filter((p) => existsSync(p));
  const network = block["network"] !== false;
  const env = stringList(block["env"], "env");

  return { image, mountAuth, network, env };
};

export interface DockerizedCommand {
  cmd: string;
  args: string[];
}

/**
 * Wrap a command built against container paths in `docker run`: the
 * host workspace mounts at /workspace (the working directory), the
 * scratch dir at /scratch, and auth dirs into the container home so
 * harness CLIs find their credentials.
 */
export const dockerize = (
  inner: DockerizedCommand,
  hostWorkspace: string,
  hostScratch: string,
  sandbox: SandboxConfig,
): DockerizedCommand => {
  const args = [
    "run",
    "--rm",
    "-v",
    `${hostWorkspace}:${CONTAINER_WORKSPACE}`,
    "-v",
    `${hostScratch}:${CONTAINER_SCRATCH}`,
    "-w",
    CONTAINER_WORKSPACE,
    "-e",
    "HOME=/root",
  ];
  for (const mount of sandbox.mountAuth) {
    args.push("-v", `${mount}:/root/${basename(mount)}`);
  }
  for (const name of sandbox.env) {
    args.push("-e", name);
  }
  if (!sandbox.network) {
    args.push("--network", "none");
  }
  args.push(sandbox.image, inner.cmd, ...inner.args);
  return { cmd: "docker", args };
};

/**
 * Fail fast before any case runs (harness spec, "Docker missing fails
 * fast"): docker on PATH, the image present locally, and the harness
 * binary resolvable inside the image.
 */
export const requireSandbox = (sandbox: SandboxConfig, harness: ResolvedHarness): void => {
  try {
    execFileSync("sh", ["-c", "command -v docker"], { stdio: "ignore", timeout: 10_000 });
  } catch {
    throw new HarnessConfigError(
      "sandbox mode needs docker on PATH — install Docker or run without --sandbox",
    );
  }
  try {
    execFileSync("docker", ["image", "inspect", sandbox.image], {
      stdio: "ignore",
      timeout: 30_000,
    });
  } catch {
    throw new HarnessConfigError(
      `sandbox image "${sandbox.image}" not found — build it (see README "Sandboxed evals") or set sandbox.image in .skillet.yaml`,
    );
  }
  try {
    execFileSync(
      "docker",
      ["run", "--rm", sandbox.image, "sh", "-c", 'command -v "$1"', "sh", harness.binary],
      {
        stdio: "ignore",
        timeout: 60_000,
      },
    );
  } catch {
    throw new HarnessConfigError(
      `harness binary "${harness.binary}" not found inside image "${sandbox.image}" — add it to the image`,
    );
  }
};
