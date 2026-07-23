import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SetupError, createWorkspace } from "./workspace.js";

const dirs: string[] = [];
const makeSkillRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "skillet-test-skill-"));
  dirs.push(root);
  return root;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("createWorkspace", () => {
  it("creates an empty workspace with no fixture or setup", () => {
    const ws = createWorkspace({ skillRoot: makeSkillRoot() });
    dirs.push(ws.dir);
    expect(existsSync(ws.dir)).toBe(true);
    ws.cleanup();
    expect(existsSync(ws.dir)).toBe(false);
  });

  it("copies fixture contents before running setup", () => {
    const root = makeSkillRoot();
    const fixture = join(root, "evals", "fixtures", "repo");
    mkdirSync(fixture, { recursive: true });
    writeFileSync(join(fixture, "file.txt"), "hello");

    const ws = createWorkspace({
      skillRoot: root,
      fixture: "repo",
      setup: "cat file.txt > copied.txt",
    });
    dirs.push(ws.dir);
    expect(readFileSync(join(ws.dir, "copied.txt"), "utf8")).toBe("hello");
  });

  it("never materializes the setup script inside the workspace", () => {
    const root = makeSkillRoot();
    const ws = createWorkspace({
      skillRoot: root,
      setup: "git init -q . && git add -A && ls -a > listing.txt",
    });
    dirs.push(ws.dir);
    const listing = readFileSync(join(ws.dir, "listing.txt"), "utf8");
    expect(listing.split("\n").filter((l) => l !== "")).toEqual([".", "..", ".git", "listing.txt"]);
    const staged = execFileSync("git", ["status", "--porcelain"], { cwd: ws.dir }).toString();
    expect(staged).not.toContain("setup.sh");
  });

  it("does not inherit repository-local Git state", () => {
    const root = makeSkillRoot();
    const sourceRepo = join(root, "source");
    const cleanGitEnvironment = { ...process.env };
    delete cleanGitEnvironment.GIT_DIR;
    delete cleanGitEnvironment.GIT_WORK_TREE;
    delete cleanGitEnvironment.GIT_INDEX_FILE;
    mkdirSync(sourceRepo);
    execFileSync("git", ["init", "-q"], { cwd: sourceRepo, env: cleanGitEnvironment });
    writeFileSync(join(sourceRepo, "source.txt"), "source\n");
    execFileSync("git", ["add", "source.txt"], { cwd: sourceRepo, env: cleanGitEnvironment });
    const sourceIndex = join(sourceRepo, ".git", "index");
    const sourceIndexBefore = readFileSync(sourceIndex);

    const previousGitDir = process.env.GIT_DIR;
    const previousGitWorkTree = process.env.GIT_WORK_TREE;
    const previousGitIndexFile = process.env.GIT_INDEX_FILE;
    process.env.GIT_DIR = join(sourceRepo, ".git");
    process.env.GIT_WORK_TREE = sourceRepo;
    process.env.GIT_INDEX_FILE = sourceIndex;

    let workspace: ReturnType<typeof createWorkspace> | undefined;
    try {
      workspace = createWorkspace({
        skillRoot: root,
        setup: "git init -q . && test -d .git && touch workspace.txt && git add -A",
      });
      dirs.push(workspace.dir);
    } finally {
      if (previousGitDir == null) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = previousGitDir;
      if (previousGitWorkTree == null) delete process.env.GIT_WORK_TREE;
      else process.env.GIT_WORK_TREE = previousGitWorkTree;
      if (previousGitIndexFile == null) delete process.env.GIT_INDEX_FILE;
      else process.env.GIT_INDEX_FILE = previousGitIndexFile;
    }

    if (workspace == null) throw new Error("workspace was not created");
    expect(existsSync(join(workspace.dir, ".git"))).toBe(true);
    expect(
      execFileSync("git", ["status", "--porcelain"], {
        cwd: workspace.dir,
        env: cleanGitEnvironment,
      }).toString(),
    ).toContain("workspace.txt");
    expect(readFileSync(sourceIndex)).toEqual(sourceIndexBefore);
  });

  it("throws SetupError and removes the workspace when setup fails", () => {
    const root = makeSkillRoot();
    // The failing setup script leaks its cwd (the workspace path) to a
    // file outside the workspace, so the test can verify removal.
    const probe = join(root, "workspace-path.txt");
    expect(() => {
      try {
        createWorkspace({ skillRoot: root, setup: `pwd > "${probe}"; exit 3` });
      } catch (error) {
        expect(error).toBeInstanceOf(SetupError);
        throw error;
      }
    }).toThrow(/setup script failed/);
    const workspaceDir = readFileSync(probe, "utf8").trim();
    expect(workspaceDir).not.toBe("");
    expect(existsSync(workspaceDir)).toBe(false);
  });

  it("gives each call an isolated directory", () => {
    const root = makeSkillRoot();
    const a = createWorkspace({ skillRoot: root, setup: "touch a" });
    const b = createWorkspace({ skillRoot: root, setup: "touch b" });
    dirs.push(a.dir, b.dir);
    expect(a.dir).not.toBe(b.dir);
    expect(existsSync(join(a.dir, "b"))).toBe(false);
    expect(existsSync(join(b.dir, "a"))).toBe(false);
  });
});
