import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { EvalRunResult } from "../eval/index.js";
import { readSpec } from "../spec/index.js";
import type { AnyModel } from "../agent/provider.js";
import { verifyCoverage } from "./coverage.js";
import { verifyResults } from "./results.js";
import { verifySemantic } from "./semantic.js";
import { verifyStructural } from "./structural.js";
import { verifyTriggers } from "./triggers.js";
import type { VerifyReport } from "./types.js";

export interface VerifyOptions {
  /** When provided, layer 3 (per-behavior results) runs on this data. */
  runResult?: EvalRunResult;
  /**
   * When set, layer 4 (semantic) runs. Requires `judgeModel`. The
   * default loop never sets this — only the standalone CLI does.
   */
  semantic?: boolean;
  /**
   * When set, layer 5 (trigger quality) runs. Requires `judgeModel`.
   * Checks whether the SKILL.md description would activate on the
   * spec's should-trigger phrases and reject the should_not phrases.
   */
  triggers?: boolean;
  /** Model used for semantic / trigger layers; required when either is true. */
  judgeModel?: AnyModel;
}

/**
 * Run layered verification. Layers run in order; later layers are
 * skipped on the first failing layer (cheap checks fail before
 * expensive ones run).
 *
 * The `ok` field on the returned report is true only when every
 * layer that ran passed.
 */
export const verify = async (
  skillRoot: string,
  opts: VerifyOptions = {},
): Promise<VerifyReport> => {
  // ── Layer 1: structural ────────────────────────────────────
  const structural = verifyStructural(skillRoot);
  if (!structural.ok) {
    return { ok: false, structural };
  }

  // After layer 1 passes we know spec.yaml (when present) parses and
  // is structurally valid. Cross-artifact checks need the parsed spec
  // — re-read here rather than passing through, since structural is
  // text-based.
  const specPath = join(skillRoot, "spec.yaml");
  const spec = existsSync(specPath) ? readSpec(specPath) : null;

  if (spec == null) {
    // No spec means cross-artifact checks have no oracle. The skill
    // is structurally fine (we passed layer 1); there's just nothing
    // for layers 2-4 to compare against. The runner returns ok=true
    // and leaves the later layers undefined — callers that require a
    // spec should check `spec == null` separately, e.g. by reading
    // the file in their own command flow before invoking verify.
    return { ok: true, structural };
  }

  // ── Layer 2: cross-artifact coverage ───────────────────────
  const coverage = verifyCoverage(spec, skillRoot);
  if (!coverage.ok) {
    return { ok: false, structural, coverage };
  }

  // ── Layer 3: per-behavior results (only when run data given) ──
  let results: VerifyReport["results"];
  if (opts.runResult != null) {
    results = verifyResults(spec, opts.runResult);
    if (!results.ok) {
      return { ok: false, structural, coverage, results };
    }
  }

  // ── Layer 4: semantic (opt-in) ─────────────────────────────
  let semantic: VerifyReport["semantic"];
  if (opts.semantic === true) {
    if (opts.judgeModel == null) {
      throw new Error("verify --semantic requires a judgeModel to be supplied");
    }
    const skillMdPath = join(skillRoot, "SKILL.md");
    if (!existsSync(skillMdPath)) {
      // Already covered by structural layer in practice; keep guard.
      return {
        ok: false,
        structural,
        coverage,
        results,
        semantic: { ok: false, behaviors: [] },
      };
    }
    const skillMd = readFileSync(skillMdPath, "utf-8");
    semantic = await verifySemantic(spec, skillMd, opts.judgeModel);
    if (!semantic.ok) {
      return { ok: false, structural, coverage, results, semantic };
    }
  }

  // ── Layer 5: trigger quality (opt-in) ─────────────────────
  let triggers: VerifyReport["triggers"];
  if (opts.triggers === true) {
    if (opts.judgeModel == null) {
      throw new Error("verify --triggers requires a judgeModel to be supplied");
    }
    const skillMdPath = join(skillRoot, "SKILL.md");
    if (!existsSync(skillMdPath)) {
      return {
        ok: false,
        structural,
        coverage,
        results,
        semantic,
        triggers: { ok: false, triggers: [] },
      };
    }
    const skillMd = readFileSync(skillMdPath, "utf-8");
    triggers = await verifyTriggers(spec, skillMd, opts.judgeModel);
    if (!triggers.ok) {
      return { ok: false, structural, coverage, results, semantic, triggers };
    }
  }

  return {
    ok: true,
    structural,
    coverage,
    ...(results == null ? {} : { results }),
    ...(semantic == null ? {} : { semantic }),
    ...(triggers == null ? {} : { triggers }),
  };
};
