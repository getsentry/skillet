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
  SkillClass,
  Behavior,
  MustNot,
  ReferenceDoc,
  Triggers,
  SpecPatch,
  SpecValidationError,
  SpecValidationResult,
} from "./types.js";

export { SPEC_PATCH_OPS, SKILL_CLASSES } from "./types.js";

// Class definitions and rendering
export { CLASSES, renderClassTable, type ClassDefinition } from "./classes.js";

// Parser
export { parseSpecYaml, parseSpecJson } from "./parser.js";

// Structural validation + class gates
export {
  validateSpecYaml,
  validateSpecObject,
  validateClassGates,
  type ClassGateResult,
} from "./structural.js";

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

// Normalization (auto-fix LLM-produced specs before validation)
export { normalizeSpec } from "./normalize.js";
