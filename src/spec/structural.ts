import { parse as parseYaml } from "yaml";
import type { SkillSpec, SpecValidationError, SpecValidationResult } from "./types.js";

const isRecord = (v: unknown): v is Record<string, unknown> => {
  return v != null && typeof v === "object" && !Array.isArray(v);
};

/** Slug regex — kebab-case, must start with a letter. */
const SLUG_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const REFERENCE_PATH_RE = /^references\/[a-z][a-z0-9-]*\.md$/;

/**
 * Validate raw `spec.yaml` text for structural issues that prevent
 * downstream consumption. Returns errors instead of throwing so the
 * verify command can collect and display them.
 *
 * This is the layer-1 check inside `verify`. It covers:
 * - YAML parses
 * - Top-level required fields (`managed_by`, `spec_version`, `name`,
 *   `intent`, `triggers.should` non-empty)
 * - Each behavior / must_not has `id` and `statement`
 * - IDs are kebab-case slugs and unique across the combined namespace
 *
 * Eval implementation lives in `evals/*.eval.ts`, not in the spec.
 * Legacy specs may carry an `eval:` block under behaviors; the parser
 * silently ignores it and the validator does not enforce its shape.
 */
export const validateSpecYaml = (
  yamlText: string,
  source: string = "spec.yaml",
): SpecValidationResult => {
  const errors: SpecValidationError[] = [];

  let parsed: unknown;
  try {
    parsed = parseYaml(yamlText);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push({ path: source, message: `invalid YAML: ${msg}` });
    return { valid: false, errors };
  }

  if (!isRecord(parsed)) {
    errors.push({ path: source, message: "top level must be a YAML object" });
    return { valid: false, errors };
  }

  // ── Top-level required fields ──
  if (parsed.managed_by !== "skillet") {
    errors.push({
      path: source,
      message: "field 'managed_by' must equal the literal string 'skillet'",
    });
  }
  if (parsed.spec_version !== 1) {
    errors.push({
      path: source,
      message: "field 'spec_version' must equal 1 (this is the only supported version)",
    });
  }
  if (typeof parsed.name !== "string" || parsed.name.trim() === "") {
    errors.push({
      path: source,
      message: "field 'name' is required and must be a non-empty string",
    });
  }
  if (typeof parsed.intent !== "string" || parsed.intent.trim() === "") {
    errors.push({
      path: source,
      message: "field 'intent' is required and must be a non-empty string",
    });
  }

  // ── Triggers ──
  const triggers = parsed.triggers;
  if (!isRecord(triggers)) {
    errors.push({ path: source, message: "field 'triggers' is required and must be an object" });
  } else {
    const should = triggers.should;
    if (!Array.isArray(should) || should.length === 0) {
      errors.push({
        path: source,
        message: "'triggers.should' must be a non-empty array of strings",
      });
    } else if (!should.every((s) => typeof s === "string")) {
      errors.push({ path: source, message: "'triggers.should' entries must all be strings" });
    }
    const shouldNot = triggers.should_not;
    if (
      shouldNot != null &&
      (!Array.isArray(shouldNot) || !shouldNot.every((s) => typeof s === "string"))
    ) {
      errors.push({
        path: source,
        message: "'triggers.should_not' must be an array of strings (or omitted)",
      });
    }
  }

  // ── Behaviors + must_not (combined ID namespace) ──
  const seenIds = new Map<string, string>(); // id -> "behavior" | "must_not"

  const validateEntry = (entry: unknown, kind: "behavior" | "must_not", index: number): void => {
    if (!isRecord(entry)) {
      errors.push({ path: source, message: `${kind}[${index}] must be an object` });
      return;
    }
    const id = entry.id;
    if (typeof id !== "string" || id.trim() === "") {
      errors.push({ path: source, message: `${kind}[${index}] missing required 'id'` });
    } else if (!SLUG_RE.test(id)) {
      errors.push({
        path: source,
        message: `${kind} '${id}' has invalid id — must be kebab-case starting with a letter (e.g. 'flag-n-plus-one')`,
      });
    } else if (seenIds.has(id)) {
      errors.push({
        path: source,
        message: `duplicate id '${id}' — already used by a ${seenIds.get(id) ?? "?"} entry; behavior and must_not share an id namespace`,
      });
    } else {
      seenIds.set(id, kind);
    }

    if (typeof entry.statement !== "string" || entry.statement.trim() === "") {
      const ref = typeof id === "string" ? id : `index ${index}`;
      errors.push({ path: source, message: `${kind} '${ref}' missing required 'statement'` });
    }
  };

  const behaviors = parsed.behaviors;
  if (behaviors != null) {
    if (!Array.isArray(behaviors)) {
      errors.push({ path: source, message: "'behaviors' must be an array (or omitted)" });
    } else {
      behaviors.forEach((entry, i) => {
        validateEntry(entry, "behavior", i);
      });
    }
  }

  const mustNot = parsed.must_not;
  if (mustNot != null) {
    if (!Array.isArray(mustNot)) {
      errors.push({ path: source, message: "'must_not' must be an array (or omitted)" });
    } else {
      mustNot.forEach((entry, i) => {
        validateEntry(entry, "must_not", i);
      });
    }
  }

  const references = parsed.references;
  if (references != null) {
    if (!Array.isArray(references)) {
      errors.push({ path: source, message: "'references' must be an array (or omitted)" });
    } else {
      const seenPaths = new Set<string>();
      references.forEach((entry, i) => {
        validateReferenceEntry(entry, i, source, errors, seenPaths);
      });
    }
  }

  return { valid: errors.length === 0, errors };
};

const validateReferenceEntry = (
  entry: unknown,
  index: number,
  source: string,
  errors: SpecValidationError[],
  seenPaths: Set<string>,
): void => {
  if (!isRecord(entry)) {
    errors.push({ path: source, message: `references[${index}] must be an object` });
    return;
  }
  const rawPath = entry.path;
  if (typeof rawPath !== "string" || rawPath.trim() === "") {
    errors.push({ path: source, message: `references[${index}] missing required 'path'` });
  } else if (!REFERENCE_PATH_RE.test(rawPath)) {
    errors.push({
      path: source,
      message: `reference path '${rawPath}' must match references/<slug>.md with no nested directories`,
    });
  } else if (seenPaths.has(rawPath)) {
    errors.push({ path: source, message: `duplicate reference path '${rawPath}'` });
  } else {
    seenPaths.add(rawPath);
  }

  for (const field of ["title", "load_when", "purpose"] as const) {
    if (typeof entry[field] !== "string" || entry[field].trim() === "") {
      const ref = typeof rawPath === "string" ? rawPath : `index ${index}`;
      errors.push({ path: source, message: `reference '${ref}' missing required '${field}'` });
    }
  }

  const topics = entry.topics;
  if (!Array.isArray(topics) || topics.length === 0) {
    const ref = typeof rawPath === "string" ? rawPath : `index ${index}`;
    errors.push({ path: source, message: `reference '${ref}' must include non-empty topics[]` });
  } else if (!topics.every((topic) => typeof topic === "string" && topic.trim() !== "")) {
    const ref = typeof rawPath === "string" ? rawPath : `index ${index}`;
    errors.push({ path: source, message: `reference '${ref}' topics[] entries must be strings` });
  }
};

/**
 * Validate an already-parsed `SkillSpec`. Useful when the caller has
 * a constructed spec (e.g. from a fresh LLM-driven init phase) and
 * wants the same checks before writing it to disk.
 *
 * Most checks delegate by serializing the spec back to YAML — the
 * raw-text validator catches the structural rules. The function adds
 * checks that only make sense on a typed spec (e.g. that
 * `managed_by`/`spec_version` match the literal types).
 */
export const validateSpecObject = (
  spec: SkillSpec,
  source: string = "spec",
): SpecValidationResult => {
  const errors: SpecValidationError[] = [];

  if (spec.managed_by !== "skillet") {
    errors.push({ path: source, message: "managed_by must equal 'skillet'" });
  }
  if (spec.spec_version !== 1) {
    errors.push({ path: source, message: "spec_version must equal 1" });
  }
  if (spec.name.trim() === "") {
    errors.push({ path: source, message: "name must be non-empty" });
  }
  if (spec.intent.trim() === "") {
    errors.push({ path: source, message: "intent must be non-empty" });
  }
  if (spec.triggers.should.length === 0) {
    errors.push({ path: source, message: "triggers.should must be non-empty" });
  }

  const seen = new Map<string, "behavior" | "must_not">();
  for (const [i, b] of spec.behaviors.entries()) {
    if (b.id === "" || !SLUG_RE.test(b.id)) {
      errors.push({
        path: source,
        message: `behaviors[${i}] id '${b.id}' is not a valid kebab-case slug`,
      });
    } else if (seen.has(b.id)) {
      errors.push({ path: source, message: `duplicate id '${b.id}'` });
    } else {
      seen.set(b.id, "behavior");
    }
    if (b.statement.trim() === "") {
      errors.push({ path: source, message: `behavior '${b.id}' has empty statement` });
    }
  }

  for (const [i, m] of spec.must_not.entries()) {
    if (m.id === "" || !SLUG_RE.test(m.id)) {
      errors.push({
        path: source,
        message: `must_not[${i}] id '${m.id}' is not a valid kebab-case slug`,
      });
    } else if (seen.has(m.id)) {
      errors.push({ path: source, message: `duplicate id '${m.id}'` });
    } else {
      seen.set(m.id, "must_not");
    }
    if (m.statement.trim() === "") {
      errors.push({ path: source, message: `must_not '${m.id}' has empty statement` });
    }
  }

  const seenReferences = new Set<string>();
  for (const [i, r] of (spec.references ?? []).entries()) {
    if (!REFERENCE_PATH_RE.test(r.path)) {
      errors.push({
        path: source,
        message: `references[${i}] path '${r.path}' must match references/<slug>.md`,
      });
    } else if (seenReferences.has(r.path)) {
      errors.push({ path: source, message: `duplicate reference path '${r.path}'` });
    } else {
      seenReferences.add(r.path);
    }
    if (r.title.trim() === "") {
      errors.push({ path: source, message: `reference '${r.path}' has empty title` });
    }
    if (r.load_when.trim() === "") {
      errors.push({ path: source, message: `reference '${r.path}' has empty load_when` });
    }
    if (r.purpose.trim() === "") {
      errors.push({ path: source, message: `reference '${r.path}' has empty purpose` });
    }
    if (r.topics.length === 0 || r.topics.some((topic) => topic.trim() === "")) {
      errors.push({
        path: source,
        message: `reference '${r.path}' must include non-empty topics[]`,
      });
    }
  }

  return { valid: errors.length === 0, errors };
};
