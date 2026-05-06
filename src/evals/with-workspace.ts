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
import { chmodSync, cpSync, existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
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
    cpSync(root, dir, { recursive: true });

    // If the fixture ships a `_setup.sh`, run it inside the
    // workspace and remove it before the agent sees the dir. This
    // is how shell-workflow fixtures (e.g. `commit` evals needing
    // a real git repo with staged changes) bootstrap state that
    // doesn't copy cleanly via cpSync — a `.git/` directory's
    // internals, file modes, etc.
    //
    // Convention is declarative: drop a `_setup.sh` in the
    // fixture root, the harness runs it, then the file is
    // deleted so the agent only sees the seeded files plus
    // whatever the script produced.
    const setupPath = join(dir, SETUP_SCRIPT_NAME);
    if (existsSync(setupPath)) {
      try {
        chmodSync(setupPath, 0o755);
      } catch {
        // best-effort — execSync below will surface real errors
      }
      try {
        execSync(`./${SETUP_SCRIPT_NAME}`, {
          cwd: dir,
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 30_000,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `createWorkspace("${slug}"): _setup.sh exited non-zero or timed out: ${msg.slice(0, 240)}`,
        );
      }
      rmSync(setupPath, { force: true });
    }
  }
  return dir;
};
