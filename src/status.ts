import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadCases } from "./evals/case.js";

export interface ArtifactState {
  present: boolean;
  path: string;
  /** Older than spec.md — needs regeneration. */
  stale?: boolean;
}

export interface SkillStatus {
  root: string;
  spec: ArtifactState;
  skill: ArtifactState;
  evals: ArtifactState & { caseCount: number };
  legacy: {
    specYaml: boolean;
  };
  /** The single next action, phrased for both humans and agents. */
  next: string;
}

const mtime = (path: string): number => {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
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
  const specMtime = mtime(specPath);

  const spec: ArtifactState = { present: specPresent, path: "spec.md" };
  const skill: ArtifactState = {
    present: skillPresent,
    path: "SKILL.md",
    ...(specPresent && skillPresent && { stale: mtime(skillPath) < specMtime }),
  };
  const evals: ArtifactState & { caseCount: number } = {
    present: caseCount > 0,
    path: "evals/cases/",
    caseCount,
  };

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
  } else if (skill.stale === true) {
    next = "spec.md changed after SKILL.md — re-render it ('skillet instructions skill').";
  } else if (caseCount === 0) {
    next = "Add eval cases for the spec behaviors ('skillet instructions evals').";
  } else {
    next = "Run 'skillet validate' and 'skillet eval' — iterate via /skillet:improve.";
  }

  return { root, spec, skill, evals, legacy, next };
};
