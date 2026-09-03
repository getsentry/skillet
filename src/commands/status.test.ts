import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { run } from "./status.js";

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

const dirs: string[] = [];

const makeWorkspace = (): { home: string; skill: string } => {
  const root = mkdtempSync(join(tmpdir(), "skillet-status-command-"));
  dirs.push(root);
  const home = join(root, "home");
  const skill = join(root, "demo");
  mkdirSync(home);
  mkdirSync(skill);
  writeFileSync(join(skill, "spec.md"), SPEC);
  return { home, skill };
};

const installAuthoringSkill = (home: string, content: string): void => {
  const root = join(home, ".agents", "skills", "skillet-authoring");
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "SKILL.md"), content);
};

const runJson = (home: string, skill: string): { next: string } => {
  vi.stubEnv("HOME", home);
  const writes: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    writes.push(String(chunk));
    return true;
  });
  try {
    expect(run([skill, "--json"])).toBe(0);
  } finally {
    spy.mockRestore();
  }
  return JSON.parse(writes.join("")) as { next: string };
};

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("status command", () => {
  it("prioritizes reinstalling a stale dotagents-managed authoring skill", () => {
    const { home, skill } = makeWorkspace();
    installAuthoringSkill(
      home,
      "---\nname: skillet-authoring\ndescription: old\nspec_hash: old\n---\n",
    );
    writeFileSync(
      join(home, ".agents", "agents.toml"),
      '[[skills]]\nname = "skillet-authoring"\nsource = "getsentry/skillet"\n',
    );

    const result = runJson(home, skill);
    expect(result.next).toContain("reinstall skillet-authoring through dotagents");
    expect(result.next).not.toContain("Render SKILL.md");
  });

  it("preserves the artifact step for a current authoring skill", () => {
    const { home, skill } = makeWorkspace();
    installAuthoringSkill(
      home,
      readFileSync(join(process.cwd(), "skills", "skillet-authoring", "SKILL.md"), "utf8"),
    );

    expect(runJson(home, skill).next).toContain("Render SKILL.md");
  });
});
