import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "./eval.js";

const SPEC = `# File Maker

## Intent

Make the agent create the file the prompt names.

## Triggers

- **SHOULD** trigger when the user asks for a file

## Behaviors

### Behavior: Make file

The agent SHALL create the named file.

#### Scenario: Simple

- **WHEN** the user names a file
- **THEN** the file exists
`;

const CASE = `behavior: make-file
prompt: result.txt
checks:
  - file_exists: result.txt
`;

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A valid skill wired to a fake sh harness that creates the prompted file. */
const makeSkill = (opts: { skillMd?: boolean } = {}): string => {
  const root = mkdtempSync(join(tmpdir(), "skillet-eval-cmd-"));
  dirs.push(root);
  writeFileSync(join(root, "spec.md"), SPEC);
  if (opts.skillMd !== false) {
    writeFileSync(join(root, "SKILL.md"), "---\nname: file-maker\ndescription: makes files\n---\n");
  }
  writeFileSync(
    join(root, ".skillet.yaml"),
    'harness:\n  command: "cd {workspace} && touch {prompt}"\n',
  );
  mkdirSync(join(root, "evals", "cases"), { recursive: true });
  writeFileSync(join(root, "evals", "cases", "make-file.yaml"), CASE);
  return root;
};

describe("eval command", () => {
  it("fails fast with a next step when SKILL.md is not rendered yet", async () => {
    const root = makeSkill({ skillMd: false });
    expect(await run([root])).toBe(1);
  });

  it("re-runs a case whose --out cache file is corrupt instead of crashing", async () => {
    const root = makeSkill();
    const out = join(root, "results");
    mkdirSync(out);
    writeFileSync(join(out, "make-file.json"), '{"id": "make-file", "trunc');
    expect(await run([root, "--out", out])).toBe(0);
    const rerun: unknown = JSON.parse(readFileSync(join(out, "make-file.json"), "utf8"));
    expect(rerun).toMatchObject({ id: "make-file", trials: [{ status: "pass" }] });
  });

  it("reuses intact --out cache files without re-running", async () => {
    const root = makeSkill();
    const out = join(root, "results");
    mkdirSync(out);
    const canned = {
      id: "make-file",
      behavior: "make-file",
      trials: [{ status: "fail", checks: [], transcript: "", durationMs: 1 }],
    };
    writeFileSync(join(out, "make-file.json"), JSON.stringify(canned));
    expect(await run([root, "--out", out, "--json"])).toBe(1);
    // Still the canned failure — nothing overwrote the cache.
    const kept: unknown = JSON.parse(readFileSync(join(out, "make-file.json"), "utf8"));
    expect(kept).toMatchObject({ trials: [{ status: "fail" }] });
  });
});
