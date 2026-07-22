import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { run } from "./validate.js";

const dirs: string[] = [];

const makeLegacySkill = (): string => {
  const root = mkdtempSync(join(tmpdir(), "skillet-validate-command-"));
  dirs.push(root);
  writeFileSync(join(root, "SPEC.md"), "# Legacy\n\n## Scope\n\nOld format.\n");
  writeFileSync(join(root, "SKILL.md"), "---\nname: demo\ndescription: d\n---\n");
  return root;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("validate command", () => {
  it("reports legacy SPEC.md and unavailable coverage in human output", () => {
    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    try {
      expect(run([makeLegacySkill()])).toBe(1);
    } finally {
      spy.mockRestore();
    }

    const output = writes.join("");
    expect(output).toContain("uppercase SPEC.md is a legacy document");
    expect(output).toContain("eval cases (0 files): ok");
    expect(output).toContain("coverage: not checked (valid spec.md required)");
  });

  it("marks coverage unchecked in JSON output", () => {
    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    try {
      expect(run([makeLegacySkill(), "--json"])).toBe(1);
    } finally {
      spy.mockRestore();
    }

    expect(JSON.parse(writes.join(""))).toMatchObject({
      ok: false,
      coverageChecked: false,
      behaviorIds: [],
      caseCount: 0,
    });
  });
});
