import { parse as parseYaml } from "yaml";
import type { Behavior, MustNot, ReferenceDoc, SkillSpec, Triggers } from "./types.js";

// ── Type guards ────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => {
  return v != null && typeof v === "object" && !Array.isArray(v);
};

const getString = (obj: Record<string, unknown>, key: string): string | undefined => {
  const v = obj[key];
  return typeof v === "string" ? v : undefined;
};

const getNumber = (obj: Record<string, unknown>, key: string): number | undefined => {
  const v = obj[key];
  return typeof v === "number" ? v : undefined;
};

const getRecord = (
  obj: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined => {
  const v = obj[key];
  return isRecord(v) ? v : undefined;
};

const getArray = (obj: Record<string, unknown>, key: string): unknown[] | undefined => {
  const v = obj[key];
  return Array.isArray(v) ? v : undefined;
};

const getStringArray = (obj: Record<string, unknown>, key: string): string[] => {
  const arr = getArray(obj, key);
  if (arr == null) return [];
  const out: string[] = [];
  for (const item of arr) {
    if (typeof item === "string") out.push(item);
  }
  return out;
};

// ── Field parsers ──────────────────────────────────────────

// Note: legacy specs may carry `eval:` blocks under behaviors/must_nots
// from the pre-migration era. The parser silently ignores them — they
// belong in the generated .eval.ts file now, not in the spec.

const parseBehavior = (entry: Record<string, unknown>, index: number, source: string): Behavior => {
  const id = getString(entry, "id");
  if (id == null || id === "") {
    throw new Error(`spec ${source}: behavior at index ${index} missing 'id'`);
  }
  const statement = getString(entry, "statement");
  if (statement == null || statement === "") {
    throw new Error(`spec ${source}: behavior '${id}' missing 'statement'`);
  }

  const result: Behavior = { id, statement };
  const rationale = getString(entry, "rationale");
  if (rationale != null) result.rationale = rationale;
  return result;
};

const parseMustNot = (entry: Record<string, unknown>, index: number, source: string): MustNot => {
  const id = getString(entry, "id");
  if (id == null || id === "") {
    throw new Error(`spec ${source}: must_not at index ${index} missing 'id'`);
  }
  const statement = getString(entry, "statement");
  if (statement == null || statement === "") {
    throw new Error(`spec ${source}: must_not '${id}' missing 'statement'`);
  }

  const result: MustNot = { id, statement };
  const rationale = getString(entry, "rationale");
  if (rationale != null) result.rationale = rationale;
  const leakageRisk = getString(entry, "leakage_risk");
  if (leakageRisk != null) result.leakage_risk = leakageRisk;
  return result;
};

const parseTriggers = (raw: Record<string, unknown> | undefined): Triggers => {
  if (raw == null) return { should: [], should_not: [] };
  return {
    should: getStringArray(raw, "should"),
    should_not: getStringArray(raw, "should_not"),
  };
};

const parseReference = (
  entry: Record<string, unknown>,
  index: number,
  source: string,
): ReferenceDoc => {
  const path = getString(entry, "path");
  if (path == null || path === "") {
    throw new Error(`spec ${source}: reference at index ${index} missing 'path'`);
  }
  const title = getString(entry, "title");
  if (title == null || title === "") {
    throw new Error(`spec ${source}: reference '${path}' missing 'title'`);
  }
  const loadWhen = getString(entry, "load_when");
  if (loadWhen == null || loadWhen === "") {
    throw new Error(`spec ${source}: reference '${path}' missing 'load_when'`);
  }
  const purpose = getString(entry, "purpose");
  if (purpose == null || purpose === "") {
    throw new Error(`spec ${source}: reference '${path}' missing 'purpose'`);
  }
  return {
    path,
    title,
    load_when: loadWhen,
    purpose,
    topics: getStringArray(entry, "topics"),
  };
};

// ── Public API ─────────────────────────────────────────────

/**
 * Parse a JSON-shaped spec value (from spec-init / spec-import LLM
 * output) into a `SkillSpec`. The phases use JSON instead of YAML
 * for LLM output to sidestep ambiguous YAML quoting (skill statements
 * frequently contain `:`, backticks, etc.). The structural shape is
 * the same as the YAML form.
 */
export const parseSpecJson = (jsonText: string, source: string = "spec.json"): SkillSpec => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`spec ${source}: invalid JSON — ${msg}`, { cause: err });
  }
  return parseSpecValue(parsed, source);
};

/**
 * Parse raw `spec.yaml` text into a `SkillSpec`. Throws on syntax
 * errors or missing per-entry required fields (id, statement). Higher-
 * level structural validation (unique IDs, required top-level fields,
 * eval-block well-formedness) lives in `src/spec/structural.ts`.
 *
 * `source` is included in error messages so users see which file
 * failed when validating across multiple skills.
 */
export const parseSpecYaml = (yamlText: string, source: string = "spec.yaml"): SkillSpec => {
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlText);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`spec ${source}: invalid YAML — ${msg}`, { cause: err });
  }
  return parseSpecValue(parsed, source);
};

/**
 * Shared structural narrowing for both YAML- and JSON-source spec
 * objects. Handles the same field extraction either way since both
 * end up as plain JS values after their respective parsers.
 */
const parseSpecValue = (parsed: unknown, source: string): SkillSpec => {
  if (!isRecord(parsed)) {
    throw new Error(`spec ${source}: top level must be an object`);
  }

  // managed_by + spec_version are required structurally; we accept
  // anything here and let structural validation report missing or
  // wrong values. This keeps the parser tolerant for `spec show` /
  // diagnostic flows.
  const managedBy = getString(parsed, "managed_by");
  const specVersion = getNumber(parsed, "spec_version");

  const name = getString(parsed, "name") ?? "";
  const intent = getString(parsed, "intent") ?? "";

  const triggers = parseTriggers(getRecord(parsed, "triggers"));

  const behaviorsRaw = getArray(parsed, "behaviors") ?? [];
  const behaviors: Behavior[] = behaviorsRaw.map((entry, i) => {
    if (!isRecord(entry)) {
      throw new Error(`spec ${source}: behaviors[${i}] is not an object`);
    }
    return parseBehavior(entry, i, source);
  });

  const mustNotRaw = getArray(parsed, "must_not") ?? [];
  const mustNot: MustNot[] = mustNotRaw.map((entry, i) => {
    if (!isRecord(entry)) {
      throw new Error(`spec ${source}: must_not[${i}] is not an object`);
    }
    return parseMustNot(entry, i, source);
  });

  const referencesRaw = getArray(parsed, "references") ?? [];
  const references: ReferenceDoc[] = referencesRaw.map((entry, i) => {
    if (!isRecord(entry)) {
      throw new Error(`spec ${source}: references[${i}] is not an object`);
    }
    return parseReference(entry, i, source);
  });

  const result: SkillSpec = {
    managed_by: managedBy === "skillet" ? "skillet" : ("skillet" as const),
    spec_version: specVersion === 1 ? 1 : (1 as const),
    name,
    intent,
    triggers,
    behaviors,
    must_not: mustNot,
  };

  if (references.length > 0) {
    result.references = references;
  }

  // Capture unknown frontmatter passthrough opaquely. Values are
  // not type-checked — they're rendered back to SKILL.md on regen
  // unchanged. spec-import populates this from the source SKILL.md.
  const extras = getRecord(parsed, "frontmatter_extras");
  if (extras != null && Object.keys(extras).length > 0) {
    result.frontmatter_extras = extras;
  }

  // Note: the `managed_by` and `spec_version` casts above are
  // deliberately permissive — wrong values pass parsing so structural
  // validation can report a useful error. The literal type is what
  // the rest of the system relies on.
  return result;
};
