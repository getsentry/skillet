import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { run } from "./new.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("new command", () => {
  it("scaffolds only spec.md", () => {
    const parent = mkdtempSync(join(tmpdir(), "skillet-new-command-"));
    dirs.push(parent);
    const root = join(parent, "demo-skill");
    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    try {
      expect(run(["Demo Skill", "--path", root, "--json"])).toBe(0);
    } finally {
      spy.mockRestore();
    }

    expect(JSON.parse(writes.join(""))).toMatchObject({ root, created: ["spec.md"] });
    expect(readFileSync(join(root, "spec.md"), "utf8")).toContain("# Demo Skill");
    expect(existsSync(join(root, "evals"))).toBe(false);
  });
});
