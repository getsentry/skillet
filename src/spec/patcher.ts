import {
  SPEC_PATCH_OPS,
  type Behavior,
  type MustNot,
  type SkillSpec,
  type SpecPatch,
} from "./types.js";

/**
 * Apply a single `SpecPatch` to a `SkillSpec`. Returns a new spec —
 * inputs are not mutated. Throws on:
 * - unknown ops (the patcher checks against `SPEC_PATCH_OPS`)
 * - operations referencing IDs that don't exist in the spec
 * - operations that would create a duplicate ID
 *
 * Failing loudly is deliberate: a malformed patch is a signal that
 * the assessment LLM produced garbage, and silently dropping or
 * misapplying ops would degrade quality without an alarm.
 */
export const applyPatch = (spec: SkillSpec, patch: SpecPatch): SkillSpec => {
  const knownOps: ReadonlySet<string> = new Set<string>(SPEC_PATCH_OPS);
  if (!knownOps.has(patch.op)) {
    throw new Error(`Unknown SpecPatch op: ${(patch as { op: string }).op}`);
  }

  // Exhaustive switch on the discriminant. The unknown-op check above
  // handles inputs that aren't part of the SpecPatch union; here we
  // assume the input is a real SpecPatch and let the type system
  // verify exhaustiveness via the `never` fallthrough at the bottom.
  switch (patch.op) {
    case "update_intent":
      return { ...spec, intent: patch.value };

    case "update_behavior": {
      const idx = spec.behaviors.findIndex((b) => b.id === patch.id);
      if (idx === -1) {
        throw new Error(`update_behavior: no behavior with id '${patch.id}'`);
      }
      const existing = spec.behaviors[idx];
      if (existing == null) {
        // Defensive: findIndex returned a non-(-1) index above.
        throw new Error(`update_behavior: behavior at index ${idx} is undefined`);
      }
      const updated: Behavior =
        patch.field === "statement"
          ? { ...existing, statement: patch.value }
          : { ...existing, rationale: patch.value };
      const behaviors = spec.behaviors.slice();
      behaviors[idx] = updated;
      return { ...spec, behaviors };
    }

    case "add_behavior": {
      assertIdAvailable(spec, patch.behavior.id, "add_behavior");
      return { ...spec, behaviors: [...spec.behaviors, patch.behavior] };
    }

    case "remove_behavior": {
      const idx = spec.behaviors.findIndex((b) => b.id === patch.id);
      if (idx === -1) {
        throw new Error(`remove_behavior: no behavior with id '${patch.id}'`);
      }
      const behaviors = spec.behaviors.slice();
      behaviors.splice(idx, 1);
      return { ...spec, behaviors };
    }

    case "update_eval": {
      const bIdx = spec.behaviors.findIndex((b) => b.id === patch.id);
      if (bIdx !== -1) {
        const existing = spec.behaviors[bIdx];
        if (existing == null) {
          throw new Error(`update_eval: behavior at index ${bIdx} is undefined`);
        }
        const behaviors = spec.behaviors.slice();
        behaviors[bIdx] = { ...existing, eval: patch.eval };
        return { ...spec, behaviors };
      }
      const mIdx = spec.must_not.findIndex((m) => m.id === patch.id);
      if (mIdx !== -1) {
        const existing = spec.must_not[mIdx];
        if (existing == null) {
          throw new Error(`update_eval: must_not at index ${mIdx} is undefined`);
        }
        const mustNot = spec.must_not.slice();
        mustNot[mIdx] = { ...existing, eval: patch.eval };
        return { ...spec, must_not: mustNot };
      }
      throw new Error(`update_eval: no behavior or must_not with id '${patch.id}'`);
    }

    case "update_must_not": {
      const idx = spec.must_not.findIndex((m) => m.id === patch.id);
      if (idx === -1) {
        throw new Error(`update_must_not: no must_not with id '${patch.id}'`);
      }
      const existing = spec.must_not[idx];
      if (existing == null) {
        throw new Error(`update_must_not: must_not at index ${idx} is undefined`);
      }
      let updated: MustNot;
      if (patch.field === "statement") {
        updated = { ...existing, statement: patch.value };
      } else if (patch.field === "rationale") {
        updated = { ...existing, rationale: patch.value };
      } else {
        // leakage_risk
        updated = { ...existing, leakage_risk: patch.value };
      }
      const mustNot = spec.must_not.slice();
      mustNot[idx] = updated;
      return { ...spec, must_not: mustNot };
    }

    case "add_must_not": {
      assertIdAvailable(spec, patch.must_not.id, "add_must_not");
      return { ...spec, must_not: [...spec.must_not, patch.must_not] };
    }

    case "remove_must_not": {
      const idx = spec.must_not.findIndex((m) => m.id === patch.id);
      if (idx === -1) {
        throw new Error(`remove_must_not: no must_not with id '${patch.id}'`);
      }
      const mustNot = spec.must_not.slice();
      mustNot.splice(idx, 1);
      return { ...spec, must_not: mustNot };
    }

    case "add_trigger": {
      const list = patch.kind === "should" ? spec.triggers.should : spec.triggers.should_not;
      if (list.includes(patch.phrase)) {
        // Idempotent — adding an existing phrase is a no-op rather
        // than an error; the LLM can re-emit the same patch across
        // iterations without breaking the loop.
        return spec;
      }
      const triggers = {
        ...spec.triggers,
        [patch.kind]: [...list, patch.phrase],
      };
      return { ...spec, triggers };
    }

    case "remove_trigger": {
      const list = patch.kind === "should" ? spec.triggers.should : spec.triggers.should_not;
      const next = list.filter((p) => p !== patch.phrase);
      if (next.length === list.length) {
        // Phrase wasn't there — no-op, same idempotency reason.
        return spec;
      }
      const triggers = {
        ...spec.triggers,
        [patch.kind]: next,
      };
      return { ...spec, triggers };
    }

    default: {
      // Exhaustiveness check: TS errors here if a SpecPatch variant
      // is added without a case, and the lint rule that demands an
      // explicit return path is satisfied.
      const _exhaustive: never = patch;
      throw new Error(`Unhandled SpecPatch variant: ${JSON.stringify(_exhaustive)}`);
    }
  }
};

/**
 * Apply a list of patches in order, threading the spec through each.
 * If any patch fails, the entire sequence is aborted (the input spec
 * is returned unchanged) and the error is rethrown — the loop should
 * surface this as an iteration error rather than partially apply.
 */
export const applyPatches = (spec: SkillSpec, patches: SpecPatch[]): SkillSpec => {
  let current = spec;
  for (const [i, patch] of patches.entries()) {
    try {
      current = applyPatch(current, patch);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`SpecPatch ${i + 1}/${patches.length} failed: ${msg}`, { cause: err });
    }
  }
  return current;
};

const assertIdAvailable = (spec: SkillSpec, id: string, opName: string): void => {
  const collidesWithBehavior = spec.behaviors.some((b) => b.id === id);
  const collidesWithMustNot = spec.must_not.some((m) => m.id === id);
  if (collidesWithBehavior || collidesWithMustNot) {
    const kind = collidesWithBehavior ? "behavior" : "must_not";
    throw new Error(
      `${opName}: id '${id}' is already used by an existing ${kind}; behavior and must_not share an id namespace`,
    );
  }
};
