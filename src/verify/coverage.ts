import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { discoverAndExtract, type DiscoveredCase } from "../eval/discovery.js";
import type { SkillSpec } from "../spec/index.js";
import type { CoverageReport, OrphanCase, StructuralIssue, UncoveredEntry } from "./types.js";

/**
 * Layer 2 verification: cross-artifact consistency. The spec acts as
 * the oracle for what eval cases must exist and what derived files
 * must look like.
 *
 * Checks:
 * - Every behavior and must_not in the spec has at least one eval
 *   case with matching `tests_behavior` (or `<id>__<slug>` name)
 * - Every eval case's `tests_behavior` resolves to a real spec entry
 * - SKILL.md `name` (when present) matches `spec.name`
 *
 * No LLM calls. Sub-second on typical skills.
 */
export const verifyCoverage = (spec: SkillSpec, skillRoot: string): CoverageReport => {
  const issues: StructuralIssue[] = [];

  // Build the set of valid spec IDs and a map back to entry metadata.
  type EntryMeta = { kind: "behavior" | "must_not"; statement: string };
  const specEntries = new Map<string, EntryMeta>();
  for (const b of spec.behaviors) {
    specEntries.set(b.id, { kind: "behavior", statement: b.statement });
  }
  for (const m of spec.must_not) {
    specEntries.set(m.id, { kind: "must_not", statement: m.statement });
  }

  // Collect all eval cases by scanning .eval.ts files for the
  // `name` and `tests_behavior` fields in each case object.
  const allCases: DiscoveredCase[] = [];
  for (const file of discoverAndExtract(skillRoot)) {
    allCases.push(...file.cases);
  }

  // Index cases by the behavior ID they test (explicit field first,
  // case-name convention as fallback).
  const casesById = new Map<string, string[]>();
  const orphans: OrphanCase[] = [];
  for (const c of allCases) {
    const id = resolveTestsBehavior(c);
    if (id == null) continue; // unlinked legacy case — not an orphan, just unmapped
    if (!specEntries.has(id)) {
      orphans.push({ caseName: c.name, filePath: c.filePath, testsBehavior: id });
      continue;
    }
    const list = casesById.get(id) ?? [];
    list.push(c.name);
    casesById.set(id, list);
  }

  // Coverage: every spec entry has at least one case.
  const covered: string[] = [];
  const uncovered: UncoveredEntry[] = [];
  for (const [id, meta] of specEntries) {
    if (casesById.has(id)) {
      covered.push(id);
    } else {
      uncovered.push({ id, kind: meta.kind, statement: meta.statement });
    }
  }

  // SKILL.md / spec name agreement.
  const skillMdPath = join(skillRoot, "SKILL.md");
  if (existsSync(skillMdPath)) {
    const skillName = readSkillMdName(skillMdPath);
    if (skillName != null && skillName !== spec.name) {
      issues.push({
        path: skillMdPath,
        message: `SKILL.md frontmatter name '${skillName}' does not match spec.name '${spec.name}' — run regen to refresh`,
      });
    }
  }

  const ok = uncovered.length === 0 && orphans.length === 0 && issues.length === 0;
  return { ok, covered, uncovered, orphans, issues };
};

const resolveTestsBehavior = (c: DiscoveredCase): string | undefined => {
  if (c.testsBehavior != null && c.testsBehavior !== "") return c.testsBehavior;
  if (c.name.includes("__")) {
    const prefix = c.name.split("__")[0];
    if (prefix != null && prefix !== "") return prefix;
  }
  return undefined;
};

const readSkillMdName = (skillMdPath: string): string | undefined => {
  let content: string;
  try {
    content = readFileSync(skillMdPath, "utf-8");
  } catch {
    return undefined;
  }
  if (!content.startsWith("---")) return undefined;
  const end = content.indexOf("---", 3);
  if (end === -1) return undefined;
  const yamlBlock = content.slice(3, end).trim();
  if (yamlBlock === "") return undefined;
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlBlock);
  } catch {
    return undefined;
  }
  if (parsed != null && typeof parsed === "object" && !Array.isArray(parsed)) {
    const name = (parsed as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  return undefined;
};
