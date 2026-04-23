import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { findSkillRoot, loadSkill } from "./loader.js";
import { discoverEvalFiles, parseEvalFile } from "../eval/parser.js";

// ── Types ─────────────────────────────────────────────────

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// ── Validator ─────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => {
  return v != null && typeof v === "object" && !Array.isArray(v);
};

/**
 * Validate a skill directory: SKILL.md frontmatter + eval file structure.
 * No LLM calls — pure structural checks.
 */
export const validateSkill = (startPath: string): ValidationResult => {
  const errors: ValidationError[] = [];

  // 1. Find skill root
  let skillRoot: string;
  try {
    skillRoot = findSkillRoot(startPath);
  } catch {
    errors.push({ path: startPath, message: "No SKILL.md found in directory or parents" });
    return { valid: false, errors };
  }

  const skillMdPath = join(skillRoot, "SKILL.md");

  // 2. Validate SKILL.md exists and is readable
  if (!existsSync(skillMdPath)) {
    errors.push({ path: skillMdPath, message: "SKILL.md file not found" });
    return { valid: false, errors };
  }

  let content: string;
  try {
    content = readFileSync(skillMdPath, "utf-8");
  } catch {
    errors.push({ path: skillMdPath, message: "SKILL.md is not readable" });
    return { valid: false, errors };
  }

  // 3. Validate frontmatter
  validateFrontmatter(content, skillMdPath, errors);

  // 4. Validate skill loads cleanly
  try {
    loadSkill(skillRoot);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push({ path: skillMdPath, message: `SKILL.md failed to load: ${msg}` });
  }

  // 5. Validate eval files
  validateEvalFiles(skillRoot, errors);

  return { valid: errors.length === 0, errors };
};

const validateFrontmatter = (
  content: string,
  filePath: string,
  errors: ValidationError[],
): void => {
  // Check for frontmatter delimiters
  if (!content.startsWith("---")) {
    errors.push({ path: filePath, message: "Missing YAML frontmatter (file must start with ---)" });
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
  } catch {
    errors.push({ path: filePath, message: "Frontmatter contains invalid YAML" });
    return;
  }

  if (!isRecord(parsed)) {
    errors.push({ path: filePath, message: "Frontmatter must be a YAML object" });
    return;
  }

  // Required fields
  if (typeof parsed.name !== "string" || parsed.name.trim() === "") {
    errors.push({ path: filePath, message: "Frontmatter missing required field: name" });
  }

  if (typeof parsed.description !== "string" || parsed.description.trim() === "") {
    errors.push({ path: filePath, message: "Frontmatter missing required field: description" });
  }
};

const validateEvalFiles = (skillRoot: string, errors: ValidationError[]): void => {
  let evalPaths: string[];
  try {
    evalPaths = discoverEvalFiles(skillRoot);
  } catch {
    // No evals directory is fine — just means no eval validation
    return;
  }

  for (const evalPath of evalPaths) {
    try {
      parseEvalFile(evalPath);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ path: evalPath, message: msg });
    }
  }
};
