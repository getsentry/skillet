import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { authoringReinstallAction } from "./authoring-install.js";

const dirs: string[] = [];
const makeAgentsDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "skillet-authoring-install-"));
  dirs.push(dir);
  return dir;
};

const installSkill = (agentsDir: string, content: string): void => {
  const root = join(agentsDir, "skills", "skillet-authoring");
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "SKILL.md"), content);
};

const skillWithHash = (hash: string): string =>
  `---\nname: skillet-authoring\ndescription: test\nspec_hash: ${hash}\n---\n`;

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("authoringReinstallAction", () => {
  it("does not advise when the standard installation is absent", () => {
    expect(authoringReinstallAction(makeAgentsDir())).toBeNull();
  });

  it("keeps the embedded hash synchronized with the bundled authoring spec", () => {
    const agentsDir = makeAgentsDir();
    const spec = readFileSync(
      join(process.cwd(), "skills", "skillet-authoring", "spec.md"),
      "utf8",
    );
    const hash = createHash("sha256").update(spec).digest("hex").slice(0, 12);
    installSkill(agentsDir, skillWithHash(hash));
    expect(authoringReinstallAction(agentsDir)).toBeNull();
  });

  it("gives dotagents-managed installations a scoped reinstall command", () => {
    const agentsDir = makeAgentsDir();
    installSkill(agentsDir, skillWithHash("old"));
    writeFileSync(
      join(agentsDir, "agents.toml"),
      '[[skills]]\nname = "skillet-authoring"\nsource = "getsentry/skillet"\n',
    );

    const action = authoringReinstallAction(agentsDir);
    expect(action).toContain(
      "npx -y @sentry/dotagents@latest --user add getsentry/skillet skillet-authoring",
    );
    expect(action).toContain("reinstall skillet-authoring through dotagents");
    expect(action).toContain("read the reinstalled ~/.agents/skills/skillet-authoring/SKILL.md");
    expect(action).toContain("otherwise start a new session");
    expect(action).toContain("rerun this status command");
  });

  it("uses original-method guidance for an unmanaged standard installation", () => {
    const agentsDir = makeAgentsDir();
    installSkill(agentsDir, skillWithHash("old"));
    writeFileSync(
      join(agentsDir, "agents.toml"),
      '[[skills]]\nname = "skillet-authoring"\nsource = "someone/else"\n',
    );

    const action = authoringReinstallAction(agentsDir);
    expect(action).toContain("same installation method that originally installed it");
    expect(action).not.toContain("dotagents@latest");
  });

  it("does not combine a matching name and source from different declarations", () => {
    const agentsDir = makeAgentsDir();
    installSkill(agentsDir, skillWithHash("old"));
    writeFileSync(
      join(agentsDir, "agents.toml"),
      [
        '[[skills]]\nname = "skillet-authoring"\nsource = "someone/else"',
        '[[skills]]\nname = "different-skill"\nsource = "getsentry/skillet"',
      ].join("\n\n"),
    );

    expect(authoringReinstallAction(agentsDir)).toContain(
      "same installation method that originally installed it",
    );
  });
});
