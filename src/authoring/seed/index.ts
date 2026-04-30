/**
 * Seed strategies for the spec-author loop.
 *
 * A seed produces a baseline `SkillSpec` from one of three inputs:
 * a free-form description, an existing SKILL.md, or an in-progress
 * improve session with eval failures. The author loop runs after
 * this on the same `SkillSpec` shape regardless of source.
 */

export { seedFromDescription } from "./from-description.js";
export { seedFromSkill } from "./from-skill.js";
export { seedFromImprove, type ImproveSeedResult } from "./from-improve.js";
