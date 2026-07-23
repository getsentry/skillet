import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findSkillRoot } from "./frontmatter.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("findSkillRoot", () => {
  it("requires exact artifact casing", () => {
    const root = mkdtempSync(join(tmpdir(), "skillet-root-case-"));
    dirs.push(root);
    const child = join(root, "nested");
    mkdirSync(child);
    writeFileSync(join(root, "SPEC.md"), "# Legacy\n");

    expect(findSkillRoot(child)).toBeNull();

    writeFileSync(join(root, "SKILL.md"), "---\nname: demo\ndescription: d\n---\n");
    expect(findSkillRoot(child)).toBe(root);
  });

  it("walks upward when discovery starts from a file", () => {
    const root = mkdtempSync(join(tmpdir(), "skillet-root-file-"));
    dirs.push(root);
    const nested = join(root, "nested");
    mkdirSync(nested);
    writeFileSync(join(root, "SKILL.md"), "---\nname: demo\ndescription: d\n---\n");
    const file = join(nested, "note.txt");
    writeFileSync(file, "note\n");

    expect(findSkillRoot(file)).toBe(root);
  });
});
