import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadCases } from "./evals/case.js";
import { parseFrontmatter } from "./skill/frontmatter.js";

/** Staleness only exists for present artifacts. */
export type ArtifactStatus = { path: string } & (
  | { present: false }
  | { present: true; stale: boolean }
);

export interface SkillStatus {
  root: string;
  /** hash identifies the spec content; SKILL.md records it as spec_hash. */
  spec: { path: string; present: boolean; hash?: string };
  skill: ArtifactStatus;
  evals: { path: string; caseCount: number };
  legacy: {
    specYaml: boolean;
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

  const specPresent = existsSync(specPath);
  const skillPresent = existsSync(skillPath);
  const caseCount = specPresent || skillPresent ? loadCases(root).cases.length : 0;
  const hash = specPresent ? specHash(specPath) : undefined;

  const spec = { present: specPresent, path: "spec.md", ...(hash != null && { hash }) };
  const skill: ArtifactStatus = skillPresent
    ? {
        present: true,
        path: "SKILL.md",
        stale: hash != null && skillIsStale(skillPath, specPath, hash),
      }
    : { present: false, path: "SKILL.md" };
  const evals = { path: "evals/cases/", caseCount };

  const legacy = { specYaml: existsSync(join(root, "spec.yaml")) };

  let next: string;
  if (!specPresent && legacy.specYaml) {
    next = "Legacy spec.yaml detected — run the /skillet:migrate workflow to produce spec.md.";
  } else if (!specPresent && skillPresent) {
    next = "SKILL.md exists without a spec — run /skillet:migrate to derive spec.md from it.";
  } else if (!specPresent) {
    next = "Write spec.md ('skillet instructions spec' has the template and rules).";
  } else if (!skillPresent) {
    next = "Render SKILL.md from the spec ('skillet instructions skill').";
  } else if (skill.present && skill.stale) {
    next = "spec.md changed after SKILL.md — re-render it ('skillet instructions skill').";
  } else if (caseCount === 0) {
    next = "Add eval cases for the spec behaviors ('skillet instructions evals').";
  } else {
    next = "Run 'skillet validate' and 'skillet eval' — iterate via /skillet:improve.";
  }

  return { root, spec, skill, evals, legacy, next };
};
