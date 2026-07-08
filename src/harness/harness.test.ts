import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HarnessConfigError, resolveHarness, resolveHarnessValue } from "./config.js";
import { buildJudgePrompt, describeWorkspace, parseVerdict } from "./judge.js";
import { buildInvocation, runHarness } from "./run.js";
import { type ResolvedHarness } from "./types.js";

const dirs: string[] = [];
const tempDir = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const customHarness = (command: string): ResolvedHarness => ({
  name: "fake",
  kind: "custom",
  binary: "sh",
  command,
});

describe("resolveHarnessValue", () => {
  it("resolves builtin names", () => {
    expect(resolveHarnessValue("codex")).toMatchObject({ kind: "codex", binary: "codex" });
    expect(resolveHarnessValue("claude")).toMatchObject({ kind: "claude", binary: "claude" });
  });

  it("rejects unknown builtin names", () => {
    expect(() => resolveHarnessValue("cursor")).toThrow(HarnessConfigError);
  });

  it("resolves a custom command template", () => {
    const harness = resolveHarnessValue({
      command: "myagent run --dir {workspace} {prompt}",
      skill_dir: "{workspace}/.myagent/skills",
    });
    expect(harness).toMatchObject({ kind: "custom", binary: "myagent" });
    expect(harness.skillDir).toBe("{workspace}/.myagent/skills");
  });

  it("rejects templates missing a placeholder", () => {
    expect(() => resolveHarnessValue({ command: "myagent {workspace}" })).toThrow(/\{prompt\}/);
    expect(() => resolveHarnessValue({ command: "myagent {prompt}" })).toThrow(/\{workspace\}/);
  });
});

describe("resolveHarness", () => {
  it("prefers the flag, then config, then the codex default", () => {
    const root = tempDir("skillet-cfg-");
    writeFileSync(join(root, ".skillet.yaml"), "harness: claude\n");
    expect(resolveHarness(root).name).toBe("claude");
    expect(resolveHarness(root, "codex").name).toBe("codex");
    expect(resolveHarness(tempDir("skillet-nocfg-")).name).toBe("codex");
  });

  it("finds config in ancestor directories", () => {
    const root = tempDir("skillet-cfg-");
    writeFileSync(join(root, ".skillet.yaml"), 'harness:\n  command: "x {workspace} {prompt}"\n');
    const nested = join(root, "skills", "my-skill");
    mkdirSync(nested, { recursive: true });
    expect(resolveHarness(nested).kind).toBe("custom");
  });

  it("rejects custom names passed via flag", () => {
    expect(() => resolveHarness(tempDir("skillet-x-"), "myagent")).toThrow(/--harness accepts/);
  });
});

describe("buildInvocation", () => {
  it("builds codex exec argv with workspace and last-message capture", () => {
    const inv = buildInvocation(
      { name: "codex", kind: "codex", binary: "codex" },
      "/ws",
      "do things",
      "/scratch",
    );
    expect(inv.cmd).toBe("codex");
    expect(inv.args).toContain("exec");
    expect(inv.args).toContain("--skip-git-repo-check");
    expect(inv.args).toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(inv.args.join(" ")).toContain("-C /ws");
    expect(inv.lastMessageFile).toBe("/scratch/last-message.txt");
    expect(inv.args.at(-1)).toBe("do things");
  });

  it("builds claude print-mode argv", () => {
    const inv = buildInvocation(
      { name: "claude", kind: "claude", binary: "claude" },
      "/ws",
      "do things",
      "/scratch",
    );
    expect(inv.cmd).toBe("claude");
    expect(inv.args).toEqual(["-p", "--dangerously-skip-permissions", "do things"]);
  });

  it("substitutes and shell-quotes custom template placeholders", () => {
    const inv = buildInvocation(
      customHarness("run {workspace} {prompt}"),
      "/ws",
      "it's tricky",
      "/scratch",
    );
    expect(inv.cmd).toBe("sh");
    expect(inv.args[1]).toBe(`run '/ws' 'it'\\''s tricky'`);
  });
});

describe("runHarness with a custom harness", () => {
  it("captures the transcript and exit code", async () => {
    const ws = tempDir("skillet-ws-");
    const run = await runHarness(
      customHarness("echo start && echo {prompt} && touch {workspace}/made.txt"),
      ws,
      "hello",
      30,
    );
    expect(run.exitCode).toBe(0);
    expect(run.timedOut).toBe(false);
    expect(run.transcript).toContain("start");
    expect(run.transcript).toContain("hello");
    expect(run.lastMessage).toContain("hello");
  });

  it("kills the process on timeout and reports it", async () => {
    const ws = tempDir("skillet-ws-");
    const started = Date.now();
    const run = await runHarness(
      customHarness("echo {prompt} > {workspace}/x && sleep 30"),
      ws,
      "p",
      1,
    );
    expect(run.timedOut).toBe(true);
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});

describe("judge pieces", () => {
  it("parses the last VERDICT line, case-insensitively", () => {
    expect(parseVerdict("reasoning...\nVERDICT: pass")).toBe("pass");
    expect(parseVerdict("VERDICT: pass\nwait no\nverdict: FAIL")).toBe("fail");
    expect(parseVerdict("no verdict here")).toBeNull();
  });

  it("describes workspace files with truncation and binary detection", () => {
    const ws = tempDir("skillet-judge-ws-");
    writeFileSync(join(ws, "small.txt"), "tiny");
    writeFileSync(join(ws, "big.txt"), "x".repeat(10_000));
    writeFileSync(join(ws, "bin.dat"), Buffer.from([0, 1, 2]));
    mkdirSync(join(ws, ".git"));
    writeFileSync(join(ws, ".git", "config"), "hidden");
    const dump = describeWorkspace(ws);
    expect(dump).toContain("--- small.txt ---\ntiny");
    expect(dump).toContain("(truncated)");
    expect(dump).toContain("bin.dat (binary");
    expect(dump).not.toContain("hidden");
  });

  it("builds a grading prompt ending with the verdict protocol", () => {
    const prompt = buildJudgePrompt("criterion text", "case prompt", "transcript", "(empty)");
    expect(prompt).toContain("criterion text");
    expect(prompt.trim().endsWith('"VERDICT: pass" or "VERDICT: fail".')).toBe(true);
  });
});
