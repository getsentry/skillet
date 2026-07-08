import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HarnessConfigError, loadConfig } from "./config.js";
import { dockerize, resolveSandbox, type SandboxConfig } from "./sandbox.js";

const dirs: string[] = [];
const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "skillet-sbx-"));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("resolveSandbox", () => {
  it("defaults to direct execution", () => {
    expect(resolveSandbox({})).toBeNull();
  });

  it("activates via flag with config defaults", () => {
    const sandbox = resolveSandbox({}, "docker");
    expect(sandbox?.image).toBe("skillet-eval");
    expect(sandbox?.network).toBe(true);
  });

  it("activates via config and reads its fields", () => {
    const root = tempDir();
    writeFileSync(
      join(root, ".skillet.yaml"),
      'sandbox:\n  enabled: true\n  image: my-img\n  network: false\n  mount_auth: ["~/.codex"]\n  env: ["ANTHROPIC_API_KEY"]\n',
    );
    const sandbox = resolveSandbox(loadConfig(root));
    expect(sandbox).toMatchObject({ image: "my-img", network: false, env: ["ANTHROPIC_API_KEY"] });
    expect(sandbox?.mountAuth).toEqual([join(homedir(), "/.codex")]);
  });

  it("--sandbox none overrides an enabled config", () => {
    const root = tempDir();
    writeFileSync(join(root, ".skillet.yaml"), "sandbox:\n  enabled: true\n");
    expect(resolveSandbox(loadConfig(root), "none")).toBeNull();
  });

  it("rejects unknown flag values and bad field types", () => {
    expect(() => resolveSandbox({}, "podman")).toThrow(HarnessConfigError);
    const root = tempDir();
    writeFileSync(join(root, ".skillet.yaml"), "sandbox:\n  enabled: true\n  env: notalist\n");
    expect(() => resolveSandbox(loadConfig(root))).toThrow(/must be a list of strings/);
  });
});

describe("dockerize", () => {
  const sandbox: SandboxConfig = {
    image: "img",
    mountAuth: ["/home/u/.codex", "/home/u/.claude.json"],
    network: true,
    env: ["ANTHROPIC_API_KEY"],
  };

  it("mounts workspace, scratch, and auth, and appends the inner command", () => {
    const wrapped = dockerize(
      { cmd: "codex", args: ["exec", "-C", "/workspace", "p"] },
      "/host/ws",
      "/host/scratch",
      sandbox,
    );
    expect(wrapped.cmd).toBe("docker");
    const joined = wrapped.args.join(" ");
    expect(joined).toContain("-v /host/ws:/workspace");
    expect(joined).toContain("-v /host/scratch:/scratch");
    expect(joined).toContain("-v /home/u/.codex:/root/.codex");
    expect(joined).toContain("-v /home/u/.claude.json:/root/.claude.json");
    expect(joined).toContain("-e ANTHROPIC_API_KEY");
    expect(joined).not.toContain("--network");
    expect(wrapped.args.slice(-6)).toEqual(["img", "codex", "exec", "-C", "/workspace", "p"]);
  });

  it("disables networking when configured", () => {
    const wrapped = dockerize({ cmd: "sh", args: ["-c", "x"] }, "/ws", "/scratch", {
      ...sandbox,
      network: false,
    });
    expect(wrapped.args.join(" ")).toContain("--network none");
  });

  it("keeps the container working directory at the mounted workspace", () => {
    const wrapped = dockerize({ cmd: "sh", args: ["-c", "x"] }, "/ws", "/scratch", sandbox);
    const wIndex = wrapped.args.indexOf("-w");
    expect(wrapped.args[wIndex + 1]).toBe("/workspace");
  });
});
