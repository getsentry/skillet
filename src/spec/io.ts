import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { stringify as stringifyYaml } from "yaml";
import { parseSpecYaml } from "./parser.js";
import type { SkillSpec } from "./types.js";

/**
 * The banner is the first thing in `spec.yaml`. It's a YAML comment
 * block (each line begins with `#`) so YAML parsers see it as
 * whitespace.
 *
 * The spec is the user's source of truth. Hand-edit it, or use
 * `skillet spec` subcommands — both are supported. Skillet validates
 * on read, so malformed edits surface as errors before they break
 * downstream commands.
 *
 * The banner is regenerated on every write rather than parsed-and-
 * preserved. Treating it as fixed content avoids drift if the wording
 * is ever updated — the next write picks up the new wording. User
 * content lives below the banner in structured YAML, so it's never
 * lost.
 */
export const SPEC_BANNER = `# ──────────────────────────────────────────────────────────
# Skillet skill spec. Edit this file directly or use the
# \`skillet spec\` subcommands — both are supported. Skillet
# validates this file on read; malformed edits will fail fast
# with a clear error before doing any work.
#
# After editing, run \`skillet improve\` to refresh SKILL.md and
# eval cases against the updated spec.
# ──────────────────────────────────────────────────────────
`;

const SPEC_FILENAME = "spec.yaml";

/**
 * Filename to look for inside a skill directory. Exported so commands
 * can compose paths consistently.
 */
export const specFileName = (): string => SPEC_FILENAME;

/**
 * Read and parse a `spec.yaml` from disk. The banner (if any) is
 * stripped naturally by the YAML parser since it's a comment. Returns
 * `null` if the file does not exist.
 */
export const readSpec = (specPath: string): SkillSpec | null => {
  if (!existsSync(specPath)) return null;
  const raw = readFileSync(specPath, "utf-8");
  return parseSpecYaml(raw, specPath);
};

/**
 * Read the raw text of a `spec.yaml` (banner included), or null if
 * missing. Useful for `spec show` and for diffing across edits.
 */
export const readSpecText = (specPath: string): string | null => {
  if (!existsSync(specPath)) return null;
  return readFileSync(specPath, "utf-8");
};

/**
 * Strip the banner from raw spec text. The banner is everything from
 * the start of the file up to (and including) the last consecutive
 * comment line at the top. Used by `spec show` to print just the data.
 */
export const stripBanner = (text: string): string => {
  const lines = text.split("\n");
  let i = 0;
  // Skip a leading run of comment lines and blank lines.
  while (i < lines.length) {
    const line = lines[i];
    if (line == null) break;
    const trimmed = line.trimStart();
    if (trimmed.startsWith("#") || trimmed === "") {
      i++;
    } else {
      break;
    }
  }
  return lines.slice(i).join("\n");
};

/**
 * Serialize a `SkillSpec` to YAML with the banner prepended.
 *
 * Field ordering matches the schema docs: identity → triggers →
 * behaviors → must_not. The `yaml` library preserves insertion order
 * when given a plain object.
 */
export const renderSpec = (spec: SkillSpec): string => {
  // Compose with explicit ordering so the file reads top-to-bottom in
  // the order the schema documents.
  const ordered: Record<string, unknown> = {
    managed_by: spec.managed_by,
    spec_version: spec.spec_version,
    name: spec.name,
    intent: spec.intent,
  };
  ordered.triggers = {
    should: spec.triggers.should,
    should_not: spec.triggers.should_not,
  };
  ordered.behaviors = spec.behaviors.map((b) => {
    const out: Record<string, unknown> = {
      id: b.id,
      statement: b.statement,
    };
    if (b.rationale != null) out.rationale = b.rationale;
    return out;
  });
  ordered.must_not = spec.must_not.map((m) => {
    const out: Record<string, unknown> = {
      id: m.id,
      statement: m.statement,
    };
    if (m.rationale != null) out.rationale = m.rationale;
    if (m.leakage_risk != null) out.leakage_risk = m.leakage_risk;
    return out;
  });

  // `lineWidth: 0` disables auto-wrapping so multi-line strings keep
  // their structure (block scalars for `intent`, `rationale`, etc).
  const yaml = stringifyYaml(ordered, { lineWidth: 0 });
  return SPEC_BANNER + yaml;
};

/**
 * Write a `SkillSpec` to disk with the CLI-managed banner. Overwrites
 * any existing content unconditionally — caller is responsible for
 * refusing-to-overwrite logic where applicable (e.g. `spec init`).
 */
export const writeSpec = (specPath: string, spec: SkillSpec): void => {
  const text = renderSpec(spec);
  writeFileSync(specPath, text, "utf-8");
};
