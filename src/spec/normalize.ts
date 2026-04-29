import { uniqueSlug } from "./slug.js";
import type { SkillSpec } from "./types.js";

const SLUG_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * Normalize an LLM-produced spec: auto-slugify any missing or
 * malformed IDs, force `managed_by` and `spec_version` to their
 * required literals.
 *
 * The structural validator only flags duplicate / malformed IDs;
 * it doesn't auto-fix them. We do that here so the LLM can be a
 * little sloppy about IDs and still produce a valid spec.
 */
export const normalizeSpec = (spec: SkillSpec): SkillSpec => {
  const usedIds = new Set<string>();

  const behaviors = spec.behaviors.map((b, i) => {
    if (b.id === "" || !SLUG_RE.test(b.id) || usedIds.has(b.id)) {
      const fresh = uniqueSlug(b.statement, usedIds, i);
      usedIds.add(fresh);
      return { ...b, id: fresh };
    }
    usedIds.add(b.id);
    return b;
  });

  const must_not = spec.must_not.map((m, i) => {
    if (m.id === "" || !SLUG_RE.test(m.id) || usedIds.has(m.id)) {
      const fresh = uniqueSlug(m.statement, usedIds, i);
      usedIds.add(fresh);
      return { ...m, id: fresh };
    }
    usedIds.add(m.id);
    return m;
  });

  return {
    ...spec,
    managed_by: "skillet",
    spec_version: 1,
    behaviors,
    must_not,
  };
};
