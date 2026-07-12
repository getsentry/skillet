import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { skillStatus } from "./status.js";

const SPEC = "# Demo\n\n## Intent\n\nDo the thing.\n";
const CASE = "behavior: b\nprompt: p\nchecks:\n  - file_exists: out.txt\n";

const dirs: string[] = [];
const makeRoot = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "skillet-status-"));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const skillMd = (specHash?: string): string =>
  `---\nname: demo\ndescription: d\n${specHash != null ? `spec_hash: ${specHash}\n` : ""}---\n`;

describe("skillStatus next-step ladder", () => {
  it("asks for spec.md in an empty directory", () => {
    expect(skillStatus(makeRoot()).next).toContain("Write spec.md");
  });

  it("directs legacy spec.yaml toward a spec.md preserving its intent", () => {
    const root = makeRoot();
    writeFileSync(join(root, "spec.yaml"), "intent: old\n");
    const status = skillStatus(root);
    expect(status.legacy.specYaml).toBe(true);
    expect(status.next).toContain("preserving its intent");
  });

  it("directs a bare SKILL.md toward deriving spec.md from it", () => {
    const root = makeRoot();
    writeFileSync(join(root, "SKILL.md"), skillMd());
    expect(skillStatus(root).next).toContain("derive spec.md");
  });

  it("asks to render SKILL.md once spec.md exists", () => {
    const root = makeRoot();
    writeFileSync(join(root, "spec.md"), SPEC);
    const status = skillStatus(root);
    expect(status.spec.present).toBe(true);
    expect(status.spec.hash).toMatch(/^[0-9a-f]{12}$/);
    expect(status.next).toContain("Render SKILL.md");
  });

  it("asks for eval cases when SKILL.md carries the current spec_hash", () => {
    const root = makeRoot();
    writeFileSync(join(root, "spec.md"), SPEC);
    const hash = skillStatus(root).spec.hash ?? "";
    writeFileSync(join(root, "SKILL.md"), skillMd(hash));
    const status = skillStatus(root);
    expect(status.skill).toMatchObject({ present: true, stale: false });
    expect(status.next).toContain("Add eval cases");
  });

  it("marks SKILL.md stale when its spec_hash diverges from spec.md", () => {
    const root = makeRoot();
    writeFileSync(join(root, "spec.md"), SPEC);
    writeFileSync(join(root, "SKILL.md"), skillMd("aaaaaaaaaaaa"));
    const status = skillStatus(root);
    expect(status.skill).toMatchObject({ present: true, stale: true });
    expect(status.next).toContain("re-render");
  });

  it("still compares hashes when an unquoted all-digit hash parsed as a number", () => {
    const root = makeRoot();
    writeFileSync(join(root, "spec.md"), SPEC);
    writeFileSync(join(root, "SKILL.md"), skillMd("123456789012"));
    // Divergent digits-only hash must read as stale, not fall back to mtime.
    expect(skillStatus(root).skill).toMatchObject({ present: true, stale: true });
  });

  it("falls back to mtimes when no spec_hash is recorded", () => {
    const root = makeRoot();
    writeFileSync(join(root, "spec.md"), SPEC);
    writeFileSync(join(root, "SKILL.md"), skillMd());
    // SKILL.md rendered before the spec changed.
    utimesSync(join(root, "SKILL.md"), new Date(2000, 0, 1), new Date(2000, 0, 1));
    expect(skillStatus(root).skill).toMatchObject({ present: true, stale: true });
  });

  it("reaches the eval/improve step with spec, fresh skill, and cases", () => {
    const root = makeRoot();
    writeFileSync(join(root, "spec.md"), SPEC);
    writeFileSync(join(root, "SKILL.md"), skillMd(skillStatus(root).spec.hash ?? ""));
    mkdirSync(join(root, "evals", "cases"), { recursive: true });
    writeFileSync(join(root, "evals", "cases", "b.yaml"), CASE);
    const status = skillStatus(root);
    expect(status.evals.caseCount).toBe(1);
    expect(status.next).toContain("skillet eval");
  });
});
