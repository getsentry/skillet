import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CURRENT_SKILLET } from "./invocation.js";
import { loadCases } from "./evals/case.js";
import { hasExactFile } from "./files.js";
import { parseFrontmatter } from "./skill/frontmatter.js";
import { parseSpec } from "./spec/parser.js";

/** Staleness only exists for present artifacts. */
export type ArtifactStatus = { path: string } & (
  | { present: false }
  | { present: true; stale: boolean }
);

export interface SkillStatus {
  root: string;
  /** hash identifies the spec content; SKILL.md records it as spec_hash. */
  spec: { path: string; present: boolean; hash?: string; valid?: boolean };
  skill: ArtifactStatus;
  evals: { path: string; caseCount: number };
  legacy: {
    specYaml: boolean;
    specMarkdown: boolean;
  };
  /** The single next action, phrased for both humans and agents. */
  next: string;
}

/** Short content hash of spec.md — survives clones, unlike mtimes. */
const specHash = (specPath: string): string => {
  return createHash("sha256").update(readFileSync(specPath)).digest("hex").slice(0, 12);
};

/**
 * A SKILL.md carrying spec_hash is stale exactly when the hash
 * diverges; without it, fall back to mtimes (unreliable after git
 * checkout, which is why renders are told to record the hash).
 */
const skillIsStale = (skillPath: string, specPath: string, hash: string): boolean => {
  const { meta } = parseFrontmatter(readFileSync(skillPath, "utf8"));
  const recorded = meta["spec_hash"];
  // String() because an unquoted all-digit hash parses as a YAML number.
  if ((typeof recorded === "string" || typeof recorded === "number") && recorded !== "") {
    return String(recorded) !== hash;
  }
  return statSync(skillPath).mtimeMs < statSync(specPath).mtimeMs;
};

/**
 * Derive workflow state purely from files on disk (agent-integration
 * spec, "Filesystem as state machine").
 */
export const skillStatus = (root: string): SkillStatus => {
  const specPath = join(root, "spec.md");
  const skillPath = join(root, "SKILL.md");

  const specPresent = hasExactFile(root, "spec.md");
  const skillPresent = hasExactFile(root, "SKILL.md");
  const caseCount = specPresent || skillPresent ? loadCases(root).cases.length : 0;
  const hash = specPresent ? specHash(specPath) : undefined;
  const specValid = specPresent
    ? (() => {
        const parsed = parseSpec(readFileSync(specPath, "utf8"));
        return parsed.spec != null && !parsed.issues.some((issue) => issue.severity === "error");
      })()
    : undefined;

  const spec = {
    present: specPresent,
    path: "spec.md",
    ...(hash != null && { hash }),
    ...(specValid != null && { valid: specValid }),
  };
  const skill: ArtifactStatus = skillPresent
    ? {
        present: true,
        path: "SKILL.md",
        stale: hash != null && skillIsStale(skillPath, specPath, hash),
      }
    : { present: false, path: "SKILL.md" };
  const evals = { path: "evals/cases/", caseCount };

  const legacy = {
    specYaml: hasExactFile(root, "spec.yaml"),
    specMarkdown: hasExactFile(root, "SPEC.md"),
  };

  let next: string;
  if (!specPresent && legacy.specMarkdown) {
    next = `Legacy SPEC.md detected — preserve or rename it, then derive lowercase spec.md from SKILL.md and the legacy document ('${CURRENT_SKILLET} instructions spec' has the format).`;
  } else if (!specPresent && legacy.specYaml) {
    next = `Legacy spec.yaml detected — write spec.md preserving its intent ('${CURRENT_SKILLET} instructions spec' has the format).`;
  } else if (!specPresent && skillPresent) {
    next = `SKILL.md exists without a spec — derive spec.md from it ('${CURRENT_SKILLET} instructions spec' has the format).`;
  } else if (!specPresent) {
    next = `Write spec.md ('${CURRENT_SKILLET} instructions spec' has the template and rules).`;
  } else if (specValid === false) {
    next = `spec.md exists but is not a valid Skillet spec — preserve or rename it if it contains legacy documentation, then fix or derive its Intent, Triggers, Behaviors, and scenarios before rendering SKILL.md ('${CURRENT_SKILLET} instructions spec').`;
  } else if (!skillPresent) {
    next = `Render SKILL.md from the spec ('${CURRENT_SKILLET} instructions skill').`;
  } else if (skill.present && skill.stale) {
    next = `spec.md changed after SKILL.md — re-render it ('${CURRENT_SKILLET} instructions skill').`;
  } else if (caseCount === 0) {
    next = `Add eval cases for the spec behaviors ('${CURRENT_SKILLET} instructions evals').`;
  } else {
    next = `Run '${CURRENT_SKILLET} validate' and '${CURRENT_SKILLET} eval'; diagnose failures from '${CURRENT_SKILLET} eval --json' transcripts.`;
  }

  return { root, spec, skill, evals, legacy, next };
};
