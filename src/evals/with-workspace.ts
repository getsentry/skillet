/**
 * Per-test workspace helper for skillet evals.
 *
 * Generated test bodies call:
 *
 * ```ts
 * const cwd = createWorkspace(skillRoot, "case-slug");
 * const result = await run(input, { metadata: { cwd } });
 * ```
 *
 * `createWorkspace` allocates a tempdir, optionally copies the
 * fixture tree at `<skillRoot>/evals/fixtures/<slug>/` into it,
 * and registers cleanup via vitest's `onTestFinished` so the
 * tempdir is removed regardless of pass/fail. No fixture-extend
 * dance — works on top of upstream's `describeEval` without
 * fighting its override chain.
 */

import { cpSync, existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { onTestFinished } from "vitest";

/**
 * Create a per-test workspace tempdir, optionally seeded from
 * `evals/fixtures/<slug>/`. Cleanup is registered with vitest;
 * the dir is removed when the test finishes (pass or fail).
 *
 * Must be called from within a test body — relies on vitest's
 * `onTestFinished` hook context.
 */
export const createWorkspace = (skillRoot: string, slug?: string): string => {
  const dir = mkdtempSync(join(tmpdir(), "skillet-eval-"));
  onTestFinished(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  if (slug != null && slug !== "") {
    const root = join(skillRoot, "evals", "fixtures", slug);
    if (!existsSync(root)) {
      throw new Error(`createWorkspace("${slug}"): no such fixture (looked under ${root}).`);
    }
    if (!statSync(root).isDirectory()) {
      throw new Error(
        `createWorkspace("${slug}"): expected a directory at ${root} but found a file.`,
      );
    }
    cpSync(root, dir, { recursive: true });
  }
  return dir;
};
