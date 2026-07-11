import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateTool } from "./generators.js";

const dirs: string[] = [];
const makeDir = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("generateTool", () => {
  it("resolves workflow cross-references to each tool's command syntax", () => {
    const projectRoot = makeDir("skillet-gen-claude-");
    vi.stubEnv("CODEX_HOME", makeDir("skillet-gen-codex-"));

    const claude = generateTool("claude", projectRoot, "0.0.0-test", true);
    const codex = generateTool("codex", projectRoot, "0.0.0-test", true);

    const claudePropose = readFileSync(
      claude.find((f) => f.path.endsWith("propose.md"))?.path ?? "",
      "utf8",
    );
    const codexPropose = readFileSync(
      codex.find((f) => f.path.endsWith("skillet-propose.md"))?.path ?? "",
      "utf8",
    );
    expect(claudePropose).toContain("/skillet:render");
    expect(codexPropose).toContain("/skillet-render");
    expect(claudePropose).not.toContain("{{cmd:");
    expect(codexPropose).not.toContain("{{cmd:");
    // Frontmatter descriptions are JSON-quoted so YAML metacharacters can't break them.
    expect(claudePropose).toMatch(/^---\ndescription: "/);
  });
});
