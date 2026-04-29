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
  Triggers,
  SpecPatch,
  SpecValidationError,
  SpecValidationResult,
} from "./types.js";

export { SPEC_PATCH_OPS } from "./types.js";

// Parser
export { parseSpecYaml, parseSpecJson } from "./parser.js";

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
export { applyPatch, applyPatches, validateSpecPatch } from "./patcher.js";

// Slug helpers
export { slugify, uniqueSlug } from "./slug.js";

// Regenerate (spec → derived SKILL.md + eval files)
export { regenerate, type RegenerateOptions, type RegenerateResult } from "./regen.js";
