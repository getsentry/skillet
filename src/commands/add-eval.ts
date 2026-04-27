import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveModels } from "../agent/provider.js";
import { runSpecImport } from "../authoring/phases/spec-import.js";
import { runSpecRefine } from "../authoring/phases/spec-refine.js";
import { findSkillRoot } from "../skill/loader.js";
import {
  applyPatches,
  readSpec,
  regenerate,
  specFileName,
  validateSpecObject,
  writeSpec,
} from "../spec/index.js";

const errorMessage = (err: unknown): string => {
  return err instanceof Error ? err.message : String(err);
};

/**
 * `skillet add-eval [path] "<behavior>" ["<behavior 2>" ...]`
 *
 * Internally a thin wrapper over `spec refine`: each behavior
 * description is translated into an `add_behavior` patch (or
 * `add_must_not` for negative rules), the spec is updated, and
 * derived files are regenerated. Auto-imports legacy skills.
 */
export const addEvalCommand = async (args: string[]): Promise<number> => {
  const nonFlags = args.filter((a) => !a.startsWith("--"));

  let skillPath: string | undefined;
  const descriptions: string[] = [];
  for (const arg of nonFlags) {
    if (skillPath == null && (arg.includes("/") || arg.startsWith(".") || existsSync(arg))) {
      skillPath = arg;
    } else {
      descriptions.push(arg);
    }
  }

  if (descriptions.length === 0) {
    console.error('Usage: skillet add-eval [path] "<behavior>" ["<another>"] ...');
    console.error("");
    console.error("Examples:");
    console.error('  skillet add-eval "should recommend select_related for FK access in loops"');
    console.error(
      '  skillet add-eval ./my-skill "handles empty input gracefully" "errors on invalid YAML"',
    );
    return 1;
  }

  const startPath = resolve(skillPath ?? ".");

  // Locate the skill root. If only SKILL.md is present (no spec.yaml),
  // auto-import first so subsequent operations work in spec-driven mode.
  let skillRoot: string;
  try {
    skillRoot = findSkillRoot(startPath);
  } catch {
    console.error(`Error: No SKILL.md found at ${startPath}`);
    console.error("Run `skillet create <description>` to start a new skill.");
    return 1;
  }

  const specPath = join(skillRoot, specFileName());
  const models = resolveModels();

  if (!existsSync(specPath)) {
    console.log("No spec.yaml found — importing from existing SKILL.md...");
    const skillMd = readFileSync(join(skillRoot, "SKILL.md"), "utf-8");
    let spec;
    try {
      spec = await runSpecImport(models.agent, skillMd);
    } catch (err: unknown) {
      console.error(`Error during import: ${errorMessage(err)}`);
      return 1;
    }
    writeSpec(specPath, spec);
    console.log(`  Wrote ${specPath}`);
  }

  const spec = readSpec(specPath);
  if (spec == null) {
    console.error(`Error: failed to read ${specPath}`);
    return 1;
  }

  // Translate the behavior descriptions into a single refine call.
  // Joining them with bullets keeps the LLM's job clear: each bullet
  // is a separate behavior to add.
  const feedback = `Add the following as new behaviors to the spec. Use the rule wording verbatim where it reads as imperative; otherwise rephrase minimally to imperative voice. For each behavior, include an \`eval\` block when the rule has a clear test shape; otherwise leave it off and let eval-gen invent one.\n\n${descriptions.map((d, i) => `${i + 1}. ${d}`).join("\n")}`;

  console.log(
    `Generating ${descriptions.length} behavior${descriptions.length === 1 ? "" : "s"}...`,
  );
  let patches;
  try {
    patches = await runSpecRefine(models.agent, spec, feedback);
  } catch (err: unknown) {
    console.error(`Error: ${errorMessage(err)}`);
    return 1;
  }

  if (patches.length === 0) {
    console.log("No patches produced — feedback didn't translate to a spec change.");
    return 0;
  }

  console.log(`Applying ${patches.length} patch${patches.length === 1 ? "" : "es"}...`);
  let updated;
  try {
    updated = applyPatches(spec, patches);
  } catch (err: unknown) {
    console.error(`Error applying patches: ${errorMessage(err)}`);
    return 1;
  }

  const validation = validateSpecObject(updated, specPath);
  if (!validation.valid) {
    console.error("Patched spec failed structural validation:");
    for (const e of validation.errors) console.error(`  ${e.message}`);
    return 1;
  }

  writeSpec(specPath, updated);
  console.log(`✓ Updated ${specPath}`);

  console.log("Regenerating SKILL.md and evals from updated spec...");
  try {
    await regenerate(skillRoot, {
      model: models.agent,
      onProgress: (msg) => {
        console.log(`  ${msg}`);
      },
    });
  } catch (err: unknown) {
    console.error(`Error during regen: ${errorMessage(err)}`);
    return 1;
  }

  return 0;
};
