/**
 * Public API boundary for the spec module.
 *
 * `spec.yaml` is the source of truth for an authored skill. External
 * consumers (commands, authoring loop, verify) import from this
 * module only — internal helpers are not part of the API.
 */

// Types
export type {
  SkillSpec,
  Behavior,
  MustNot,
  BehaviorEval,
  Triggers,
  SkillClass,
  SpecPatch,
  SpecValidationError,
  SpecValidationResult,
} from "./types.js";

export { SPEC_PATCH_OPS } from "./types.js";

// Parser
export { parseSpecYaml } from "./parser.js";

// Structural validation
export { validateSpecYaml, validateSpecObject } from "./structural.js";

// IO (read/write with banner preservation)
export {
  readSpec,
  readSpecText,
  writeSpec,
  renderSpec,
  stripBanner,
  specFileName,
  SPEC_BANNER,
} from "./io.js";

// Patcher
export { applyPatch, applyPatches } from "./patcher.js";

// Slug helpers
export { slugify, uniqueSlug } from "./slug.js";

// Regenerate (spec → derived SKILL.md + eval YAMLs)
export { regenerate, type RegenerateOptions, type RegenerateResult } from "./regen.js";
