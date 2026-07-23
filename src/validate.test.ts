import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateSkill } from "./validate.js";

const SPEC = `# Demo

## Intent

Do the thing.

## Triggers

- **SHOULD** trigger when asked to make output

## Behaviors

### Behavior: Make output

The agent SHALL create out.txt.

#### Scenario: Simple

- **WHEN** asked
- **THEN** out.txt exists
`;

const dirs: string[] = [];
const makeRoot = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "skillet-validate-"));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const addCase = (root: string): void => {
  mkdirSync(join(root, "evals", "cases"), { recursive: true });
  writeFileSync(
    join(root, "evals", "cases", "make-output.yaml"),
    "behavior: make-output\nprompt: p\nchecks:\n  - file_exists: out.txt\n",
  );
};

describe("validateSkill", () => {
  it("passes a complete skill", () => {
    const root = makeRoot();
    writeFileSync(join(root, "spec.md"), SPEC);
    writeFileSync(join(root, "SKILL.md"), "---\nname: demo\ndescription: d\nspec_hash: x\n---\n");
    addCase(root);
    const report = validateSkill(root);
    expect(report.ok).toBe(true);
    expect(report.coverageChecked).toBe(true);
    expect(report.evalCases).toHaveLength(1);
  });

  it("errors when spec.md is missing", () => {
    const report = validateSkill(makeRoot());
    expect(report.ok).toBe(false);
    expect(report.coverageChecked).toBe(false);
    expect(report.spec.some((i) => i.severity === "error")).toBe(true);
  });

  it("marks uppercase SPEC.md as legacy and leaves coverage unchecked", () => {
    const root = makeRoot();
    writeFileSync(join(root, "SPEC.md"), "# Legacy\n\n## Scope\n\nOld format.\n");
    writeFileSync(join(root, "SKILL.md"), "---\nname: demo\ndescription: d\n---\n");
    const report = validateSkill(root);

    expect(report.ok).toBe(false);
    expect(report.parsedSpec).toBeNull();
    expect(report.coverageChecked).toBe(false);
    expect(report.coverage).toEqual([]);
    expect(report.spec[0]?.message).toContain("uppercase SPEC.md");
  });

  it("checks case schemas but not coverage when spec.md is invalid", () => {
    const root = makeRoot();
    writeFileSync(join(root, "spec.md"), "# Broken\n\n## Intent\n\nMissing behaviors.\n");
    writeFileSync(join(root, "SKILL.md"), "---\nname: demo\ndescription: d\n---\n");
    addCase(root);
    const report = validateSkill(root);

    expect(report.ok).toBe(false);
    expect(report.evalCases).toHaveLength(1);
    expect(report.cases).toEqual([]);
    expect(report.coverageChecked).toBe(false);
    expect(report.coverage).toEqual([]);
  });

  it("treats a missing SKILL.md as a warning, not an error", () => {
    const root = makeRoot();
    writeFileSync(join(root, "spec.md"), SPEC);
    addCase(root);
    const report = validateSkill(root);
    expect(report.ok).toBe(true);
    expect(report.skill).toEqual([expect.objectContaining({ severity: "warning" })]);
  });

  it("errors on SKILL.md without frontmatter or without name/description", () => {
    const root = makeRoot();
    writeFileSync(join(root, "spec.md"), SPEC);
    addCase(root);
    writeFileSync(join(root, "SKILL.md"), "no frontmatter\n");
    expect(validateSkill(root).ok).toBe(false);
    writeFileSync(join(root, "SKILL.md"), "---\nname: demo\n---\n");
    const report = validateSkill(root);
    expect(report.ok).toBe(false);
    expect(report.skill.some((i) => i.message.includes('"description"'))).toBe(true);
  });

  it("warns when SKILL.md records no spec_hash", () => {
    const root = makeRoot();
    writeFileSync(join(root, "spec.md"), SPEC);
    addCase(root);
    writeFileSync(join(root, "SKILL.md"), "---\nname: demo\ndescription: d\n---\n");
    const report = validateSkill(root);
    expect(report.ok).toBe(true);
    expect(report.skill.some((i) => i.message.includes("spec_hash"))).toBe(true);
  });

  it("aggregates coverage errors into ok", () => {
    const root = makeRoot();
    writeFileSync(join(root, "spec.md"), SPEC);
    writeFileSync(join(root, "SKILL.md"), "---\nname: demo\ndescription: d\nspec_hash: x\n---\n");
    mkdirSync(join(root, "evals", "cases"), { recursive: true });
    writeFileSync(
      join(root, "evals", "cases", "ghost.yaml"),
      "behavior: ghost\nprompt: p\nchecks:\n  - file_exists: out.txt\n",
    );
    const report = validateSkill(root);
    expect(report.ok).toBe(false);
    expect(report.coverage.some((i) => i.message.includes('"ghost"'))).toBe(true);
  });
});
