import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { installSkill } from "./install.js";
import { runJudge } from "./judge.js";
import type { ResolvedHarness } from "./types.js";

const dirs: string[] = [];
const tempDir = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const makeSkill = (): string => {
  const root = tempDir("skillet-install-skill-");
  writeFileSync(join(root, "SKILL.md"), "---\nname: demo-skill\ndescription: d\n---\nBody text.\n");
  writeFileSync(join(root, "spec.md"), "# Demo Skill\n");
  mkdirSync(join(root, "references"), { recursive: true });
  writeFileSync(join(root, "references", "evals-guide.md"), "legit content");
  mkdirSync(join(root, "evals", "cases"), { recursive: true });
  writeFileSync(join(root, "evals", "cases", "secret.yaml"), "behavior: x\nprompt: p\n");
  return root;
};

describe("installSkill", () => {
  it("claude: installs under .claude/skills without the evals directory", () => {
    const skill = makeSkill();
    const workspace = tempDir("skillet-install-ws-");
    installSkill({ name: "claude", kind: "claude", binary: "claude" }, skill, workspace);
    const dest = join(workspace, ".claude", "skills", "demo-skill");
    expect(readFileSync(join(dest, "SKILL.md"), "utf-8")).toContain("Body text");
    // Grading criteria must not be visible to the agent under test...
    expect(existsSync(join(dest, "evals"))).toBe(false);
    // ...but legitimate content whose name merely contains "evals" survives.
    expect(existsSync(join(dest, "references", "evals-guide.md"))).toBe(true);
  });

  it("codex: writes AGENTS.md pointing at a staged copy outside the workspace", () => {
    const skill = makeSkill();
    const workspace = tempDir("skillet-install-ws-");
    const installation = installSkill(
      { name: "codex", kind: "codex", binary: "codex" },
      skill,
      workspace,
    );
    const agentsMd = readFileSync(join(workspace, "AGENTS.md"), "utf-8");
    expect(agentsMd).toContain("Body text");
    const staged = /live at (\S+)\//.exec(agentsMd)?.[1] ?? "";
    expect(staged.startsWith(workspace)).toBe(false);
    expect(existsSync(join(staged, "evals"))).toBe(false);
    installation.cleanup();
    expect(existsSync(staged)).toBe(false);
  });

  it("custom: installs into the skill_dir template", () => {
    const skill = makeSkill();
    const workspace = tempDir("skillet-install-ws-");
    installSkill(
      {
        name: "x",
        kind: "custom",
        binary: "x",
        command: "x {workspace} {prompt}",
        skillDir: "{workspace}/.agent/skills",
      },
      skill,
      workspace,
    );
    expect(existsSync(join(workspace, ".agent", "skills", "SKILL.md"))).toBe(true);
    expect(existsSync(join(workspace, ".agent", "skills", "evals"))).toBe(false);
  });
});

const verdictHarness = (script: string): ResolvedHarness => ({
  name: "fake-judge",
  kind: "custom",
  binary: "sh",
  command: `${script} # {workspace} {prompt}`,
});

describe("runJudge through an offline harness", () => {
  it("returns the parsed verdict and reasoning", async () => {
    const workspace = tempDir("skillet-judge-ws-");
    const verdict = await runJudge(
      verdictHarness(`printf 'looks correct\\nVERDICT: pass\\n'`),
      "criterion",
      "case prompt",
      "transcript",
      workspace,
    );
    expect(verdict.status).toBe("pass");
    expect(verdict.reasoning).toContain("looks correct");
  });

  it("errors (never silently fails) when no VERDICT line appears", async () => {
    const workspace = tempDir("skillet-judge-ws-");
    const verdict = await runJudge(
      verdictHarness(`echo 'no verdict here'`),
      "criterion",
      "case prompt",
      "transcript",
      workspace,
    );
    expect(verdict.status).toBe("error");
    expect(verdict.reasoning).toContain("no VERDICT line after retry");
  });
});
