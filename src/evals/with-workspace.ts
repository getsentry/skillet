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

import { execSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { onTestFinished } from "vitest";

const SETUP_SCRIPT_NAME = "_setup.sh";

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

    // Copy fixture contents EXCEPT _setup.sh — the script lives
    // outside the workspace so a `git add .` inside it can't grab
    // the script and leave a "deleted _setup.sh" ghost in `git
    // status` after we remove it. Then run the script with cwd
    // pointing at the workspace.
    const setupSrc = join(root, SETUP_SCRIPT_NAME);
    const hasSetup = existsSync(setupSrc);
    for (const entry of readdirSync(root)) {
      if (entry === SETUP_SCRIPT_NAME) continue;
      cpSync(join(root, entry), join(dir, entry), { recursive: true });
    }

    if (hasSetup) {
      // Stage the setup script in its own tempdir so it never
      // touches the workspace.
      const scriptDir = mkdtempSync(join(tmpdir(), "skillet-eval-setup-"));
      const scriptPath = join(scriptDir, SETUP_SCRIPT_NAME);
      copyFileSync(setupSrc, scriptPath);
      try {
        chmodSync(scriptPath, 0o755);
      } catch {
        // best-effort — execSync below will surface real errors
      }
      try {
        execSync(scriptPath, {
          cwd: dir,
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 30_000,
        });
      } catch (err: unknown) {
        rmSync(scriptDir, { recursive: true, force: true });
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `createWorkspace("${slug}"): _setup.sh exited non-zero or timed out: ${msg.slice(0, 240)}`,
        );
      }
      rmSync(scriptDir, { recursive: true, force: true });
    }
  }
  return dir;
};
