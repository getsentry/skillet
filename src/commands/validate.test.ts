import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { run } from "./validate.js";

const dirs: string[] = [];

const SPEC = `# Demo

## Intent

Do the thing.

## Triggers

- **SHOULD** trigger when asked

## Behaviors

### Behavior: Do it

The agent SHALL do it.

#### Scenario: Asked

- **WHEN** asked
- **THEN** it is done
`;

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
  it("reports a core skill as valid without eval cases", () => {
    const root = mkdtempSync(join(tmpdir(), "skillet-validate-command-"));
    dirs.push(root);
    writeFileSync(join(root, "spec.md"), SPEC);
    writeFileSync(
      join(root, "SKILL.md"),
      "---\nname: demo\ndescription: does the thing\nspec_hash: current\n---\n",
    );
    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    try {
      expect(run([root])).toBe(0);
    } finally {
      spy.mockRestore();
    }

    const output = writes.join("");
    expect(output).toContain("optional eval cases (0 files): ok");
    expect(output).toContain("eval links: ok");
    expect(output).not.toContain("has no eval case");
  });

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
    expect(output).toContain("optional eval cases (0 files): ok");
    expect(output).toContain("eval links: not checked (valid spec.md required)");
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
