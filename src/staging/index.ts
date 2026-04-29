/**
 * Staged writes with atomic swap.
 *
 * Mutating commands (`spec import`, `improve`, `create`, `add-eval`,
 * `spec refine`) historically wrote spec.yaml and SKILL.md directly,
 * then ran eval-gen. A failure during eval-gen left the user with a
 * clobbered SKILL.md and no way back. This module provides a staging
 * dir + per-file atomic swap so failures don't touch the live skill.
 *
 * Usage:
 *
 *   const stage = createStaging(skillRoot);
 *   try {
 *     // write all derived files into stage.dir, never into skillRoot
 *     await regenerate(stage.dir, { ... });
 *     stage.commit();  // moves staged files into skillRoot
 *   } catch (err) {
 *     stage.discard();  // throws away the staging dir; live skill unchanged
 *     throw err;
 *   }
 *
 * Per-file rename() is atomic on POSIX. Multi-file groups are not, so
 * a hard crash mid-commit could leave one file new and another old.
 * That window is small and a much better failure mode than today's
 * "lost the SKILL.md before generating new ones."
 */

import {
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { event } from "../log.js";

export interface Staging {
  /** Absolute path of the staging directory. Pass this where `skillRoot` would normally go. */
  dir: string;
  /** Move every file/dir from the staging dir into the live skill root. Idempotent on success. */
  commit: () => void;
  /** Remove the staging dir and leave the live skill untouched. */
  discard: () => void;
}

/**
 * Create a sibling staging directory next to the skill root. Sibling
 * (rather than inside the skill or in /tmp) keeps the rename() in
 * the same filesystem so it stays atomic and cheap.
 */
export const createStaging = (skillRoot: string): Staging => {
  const parent = dirname(skillRoot);
  // mkdtempSync requires the prefix template to end before the X's;
  // node's mkdtemp appends 6 random chars to the prefix.
  const stagingDir = mkdtempSync(join(parent, ".skillet-staging-"));
  event("info", `staging dir created`, { dir: stagingDir });

  let committed = false;
  let discarded = false;

  return {
    dir: stagingDir,
    commit: () => {
      if (committed) return;
      if (discarded) {
        throw new Error("staging: cannot commit after discard");
      }
      mkdirSync(skillRoot, { recursive: true });
      moveTree(stagingDir, skillRoot);
      try {
        rmSync(stagingDir, { recursive: true, force: true });
      } catch {
        // staging dir may already be empty after moves; ignore.
      }
      committed = true;
      event("info", `staging committed → ${skillRoot}`);
    },
    discard: () => {
      if (discarded) return;
      if (committed) {
        // No-op — once committed, there's nothing to discard.
        return;
      }
      try {
        rmSync(stagingDir, { recursive: true, force: true });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        event("warn", `staging discard failed (manual cleanup may be needed)`, {
          dir: stagingDir,
          error: msg,
        });
      }
      discarded = true;
      event("info", `staging discarded`, { dir: stagingDir });
    },
  };
};

/**
 * Move every entry under `src` into `dst`, preserving relative paths.
 * Each leaf rename is atomic. Existing files in `dst` are overwritten.
 */
const moveTree = (src: string, dst: string): void => {
  const entries = readdirSync(src, { withFileTypes: true, encoding: "utf-8" });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const dstPath = join(dst, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(dstPath, { recursive: true });
      moveTree(srcPath, dstPath);
      // After moving its contents the source dir is empty; remove it.
      try {
        rmSync(srcPath, { recursive: false, force: true });
      } catch {
        // Already gone or non-empty due to a race; safe to skip.
      }
    } else {
      mkdirSync(dirname(dstPath), { recursive: true });
      // rename() on POSIX is atomic; on conflict it overwrites.
      renameSync(srcPath, dstPath);
      event("debug", `staged → live`, { path: relative(dst, dstPath) });
    }
  }
};

/**
 * Seed the staging dir with the live skill's files so commands that
 * read-modify-write (e.g. add-eval reading existing eval files,
 * spec refine reading the existing spec) see a consistent view.
 *
 * Files are HARD-LINKED rather than copied where possible to keep
 * the staging cheap. On systems without hard links (Windows, some
 * filesystems) we fall back to copy.
 */
export const seedStagingFromSkill = (stagingDir: string, skillRoot: string): void => {
  if (!existsSync(skillRoot)) return;
  const entries = readdirSync(skillRoot, { withFileTypes: true, encoding: "utf-8" });
  for (const entry of entries) {
    const srcPath = join(skillRoot, entry.name);
    const dstPath = join(stagingDir, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(dstPath, { recursive: true });
      seedStagingFromSkill(dstPath, srcPath);
    } else if (entry.isFile()) {
      try {
        // Hard link is cheap and identical contents until written.
        // When a write happens against the staged path, node's
        // writeFileSync replaces the inode rather than mutating it,
        // so the live skill's link is unaffected.
        linkOrCopy(srcPath, dstPath);
      } catch {
        // skip unreadable files — they'll just not appear in the
        // staged tree, which means commit won't move them; the
        // original stays put.
      }
    }
  }
};

const linkOrCopy = (src: string, dst: string): void => {
  try {
    linkSync(src, dst);
  } catch {
    copyFileSync(src, dst);
  }
};

/**
 * Convenience wrapper: seed staging from the live skill (if it
 * exists), run the caller's work against the staging dir, and
 * commit on success / discard on failure.
 *
 * The inner function receives the staging directory path and should
 * treat it as the skill root for all reads and writes. On commit,
 * the staging tree replaces the corresponding entries in the live
 * skill. On any thrown error, staging is discarded and the live
 * skill is unchanged.
 */
export const withStaging = async <T>(
  skillRoot: string,
  fn: (stagingDir: string) => Promise<T>,
): Promise<T> => {
  const stage = createStaging(skillRoot);
  if (existsSync(skillRoot)) {
    seedStagingFromSkill(stage.dir, skillRoot);
  }
  try {
    const result = await fn(stage.dir);
    stage.commit();
    return result;
  } catch (err) {
    stage.discard();
    throw err;
  }
};

/**
 * Defensive helper: recover any lingering staging directories from
 * a previous interrupted run. Skillet doesn't auto-clean these
 * (a crash leaves the dir for forensic inspection), but this can
 * be called from a future `skillet clean` subcommand.
 */
export const findOrphanStaging = (skillRoot: string): string[] => {
  const parent = dirname(skillRoot);
  if (!existsSync(parent)) return [];
  const out: string[] = [];
  for (const name of readdirSync(parent)) {
    if (name.startsWith(".skillet-staging-")) {
      const full = join(parent, name);
      try {
        if (statSync(full).isDirectory()) {
          out.push(full);
        }
      } catch {
        // continue
      }
    }
  }
  return out;
};
