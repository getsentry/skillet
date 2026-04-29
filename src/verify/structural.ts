import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { discoverEvalTsFiles, extractCasesFromEvalTs } from "../eval/discovery.js";
import { specFileName, validateSpecYaml } from "../spec/index.js";
import type { StructuralIssue, StructuralReport } from "./types.js";

const isRecord = (v: unknown): v is Record<string, unknown> => {
  return v != null && typeof v === "object" && !Array.isArray(v);
};

/**
 * Layer 1 verification: per-file structural lint across all artifacts
 * in the skill directory. Subsumes the per-file checks that the
 * (now-removed) `validate` command provided.
 *
 * Covers:
 * - `spec.yaml` (when present): valid YAML, required fields, unique
 *   IDs (delegates to `validateSpecYaml`)
 * - `SKILL.md`: frontmatter parse + required `name`, `description`
 * - `evals/*.eval.ts`: file is readable and contains at least one
 *   case object with a `name` field (cheap regex scan; vitest itself
 *   surfaces deeper TypeScript errors when the file actually runs)
 *
 * Returns errors but does not throw — callers aggregate across layers
 * and surface them together.
 */
export const verifyStructural = (skillRoot: string): StructuralReport => {
  const errors: StructuralIssue[] = [];

  // ── spec.yaml ─────────────────────────────────────────────
  const specPath = join(skillRoot, specFileName());
  if (existsSync(specPath)) {
    try {
      const text = readFileSync(specPath, "utf-8");
      const result = validateSpecYaml(text, specPath);
      for (const e of result.errors) {
        errors.push({ path: e.path, message: e.message });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ path: specPath, message: `failed to read: ${msg}` });
    }
  }

  // ── SKILL.md ──────────────────────────────────────────────
  const skillMdPath = join(skillRoot, "SKILL.md");
  if (existsSync(skillMdPath)) {
    try {
      const content = readFileSync(skillMdPath, "utf-8");
      validateSkillMdContent(content, skillMdPath, errors);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ path: skillMdPath, message: `failed to read: ${msg}` });
    }
  }

  // ── evals/*.eval.ts ───────────────────────────────────────
  for (const evalPath of discoverEvalTsFiles(skillRoot)) {
    let content: string;
    try {
      content = readFileSync(evalPath, "utf-8");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ path: evalPath, message: `failed to read: ${msg}` });
      continue;
    }
    if (!content.includes("describeEval")) {
      errors.push({
        path: evalPath,
        message: "no `describeEval` call found — eval file must use the @sentry/skillet/evals API",
      });
      continue;
    }
    const cases = extractCasesFromEvalTs(evalPath);
    if (cases.length === 0) {
      errors.push({
        path: evalPath,
        message: "no case objects discovered (each case must have a `name` field)",
      });
    }
  }

  return { ok: errors.length === 0, errors };
};

/**
 * Per-file SKILL.md frontmatter check. Replaces the equivalent logic
 * in the (now-removed) `src/skill/validator.ts`.
 */
const validateSkillMdContent = (
  content: string,
  filePath: string,
  errors: StructuralIssue[],
): void => {
  if (!content.startsWith("---")) {
    errors.push({
      path: filePath,
      message: "Missing YAML frontmatter (file must start with ---)",
    });
    return;
  }

  const endIdx = content.indexOf("---", 3);
  if (endIdx === -1) {
    errors.push({ path: filePath, message: "Unclosed frontmatter (missing closing ---)" });
    return;
  }

  const yamlBlock = content.slice(3, endIdx).trim();
  if (yamlBlock === "") {
    errors.push({ path: filePath, message: "Empty frontmatter" });
    return;
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(yamlBlock);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push({ path: filePath, message: `Frontmatter contains invalid YAML: ${msg}` });
    return;
  }

  if (!isRecord(parsed)) {
    errors.push({ path: filePath, message: "Frontmatter must be a YAML object" });
    return;
  }

  if (typeof parsed.name !== "string" || parsed.name.trim() === "") {
    errors.push({ path: filePath, message: "Frontmatter missing required field: name" });
  }
  if (typeof parsed.description !== "string" || parsed.description.trim() === "") {
    errors.push({ path: filePath, message: "Frontmatter missing required field: description" });
  }
};
