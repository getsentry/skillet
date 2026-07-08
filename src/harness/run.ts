import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONTAINER_SCRATCH, CONTAINER_WORKSPACE, dockerize } from "./sandbox.js";
import type { SandboxConfig } from "./sandbox.js";
import type { HarnessRun, ResolvedHarness } from "./types.js";

const shQuote = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`;

interface Invocation {
  cmd: string;
  args: string[];
  /** File the harness writes the final message to, if it supports that. */
  lastMessageFile?: string;
}

/** Map a harness to the exact command/args that run one prompt in a workspace. */
export const buildInvocation = (
  harness: ResolvedHarness,
  workspace: string,
  prompt: string,
  scratchDir: string,
): Invocation => {
  if (harness.kind === "codex") {
    const lastMessageFile = join(scratchDir, "last-message.txt");
    return {
      cmd: "codex",
      // Full bypass mirrors the claude harness's permission skip: the
      // workspace is a disposable tempdir, and codex's workspace-write
      // sandbox denies .git writes, which breaks any skill that commits.
      args: [
        "exec",
        "-C",
        workspace,
        "--skip-git-repo-check",
        "--dangerously-bypass-approvals-and-sandbox",
        "--ephemeral",
        "--color",
        "never",
        "-o",
        lastMessageFile,
        prompt,
      ],
      lastMessageFile,
    };
  }
  if (harness.kind === "claude") {
    return {
      cmd: "claude",
      args: ["-p", "--dangerously-skip-permissions", prompt],
    };
  }
  const command = (harness.command ?? "")
    .replaceAll("{workspace}", shQuote(workspace))
    .replaceAll("{prompt}", shQuote(prompt));
  return { cmd: "sh", args: ["-c", command] };
};

/**
 * Spawn the harness agent on a prompt in a workspace, capture the
 * transcript, and enforce the per-case timeout (harness spec,
 * "Transcript capture"). With a sandbox, the invocation is built
 * against container paths and wrapped in `docker run`; the last
 * message is still read from the host side of the scratch mount.
 */
export const runHarness = async (
  harness: ResolvedHarness,
  workspace: string,
  prompt: string,
  timeoutSeconds: number,
  sandbox?: SandboxConfig | null,
): Promise<HarnessRun> => {
  const scratchDir = mkdtempSync(join(tmpdir(), "skillet-run-"));
  let invocation: Invocation;
  if (sandbox != null) {
    const inner = buildInvocation(harness, CONTAINER_WORKSPACE, prompt, CONTAINER_SCRATCH);
    const wrapped = dockerize(inner, workspace, scratchDir, sandbox);
    invocation = {
      ...wrapped,
      ...(inner.lastMessageFile != null && {
        lastMessageFile: join(scratchDir, "last-message.txt"),
      }),
    };
  } else {
    invocation = buildInvocation(harness, workspace, prompt, scratchDir);
  }
  const started = Date.now();

  try {
    const result = await new Promise<{
      out: string;
      err: string;
      code: number | null;
      timedOut: boolean;
    }>((resolvePromise, rejectPromise) => {
      // detached: the child leads its own process group, so a timeout
      // kill reaps grandchildren too (they'd otherwise hold the stdio
      // pipes open and stall the run forever).
      const child = spawn(invocation.cmd, invocation.args, {
        cwd: workspace,
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
        detached: true,
      });
      let out = "";
      let err = "";
      let timedOut = false;
      let settled = false;
      const settle = (code: number | null): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolvePromise({ out, err, code, timedOut });
      };
      const killGroup = (): void => {
        try {
          if (child.pid != null) process.kill(-child.pid, "SIGKILL");
          else child.kill("SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      };
      const timer = setTimeout(() => {
        timedOut = true;
        killGroup();
      }, timeoutSeconds * 1000);
      child.stdout.on("data", (chunk: Buffer) => {
        out += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        err += chunk.toString();
      });
      child.on("error", (spawnErr) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        rejectPromise(spawnErr);
      });
      // close = process exited AND stdio drained; exit + grace covers
      // orphaned grandchildren keeping the pipes open.
      child.on("close", (code) => {
        settle(code);
      });
      child.on("exit", (code) => {
        setTimeout(() => {
          settle(code);
        }, 1_000).unref();
      });
    });

    const transcript = [result.out, result.err]
      .filter((s) => s.trim() !== "")
      .join("\n--- stderr ---\n");
    let lastMessage = result.out.trim();
    if (invocation.lastMessageFile != null) {
      try {
        lastMessage = readFileSync(invocation.lastMessageFile, "utf-8").trim();
      } catch {
        // agent died before writing the file — fall back to stdout
      }
    }
    return {
      transcript,
      lastMessage,
      exitCode: result.code,
      timedOut: result.timedOut,
      durationMs: Date.now() - started,
    };
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
};
