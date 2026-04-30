import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveModels } from "../agent/provider.js";
import { SpecAuthorPaused, runSpecAuthor } from "../authoring/phases/spec-author.js";
import { runSpecRefine } from "../authoring/phases/spec-refine.js";
import { seedFromDescription, seedFromSkill } from "../authoring/seed/index.js";
import { sessionExists } from "../authoring/session.js";
import { handleSpecAuthorPause } from "../cli/pause.js";
import { createInteractiveSession } from "../cli/transport.js";
import { withStaging } from "../staging/index.js";
import {
  applyPatches,
  readSpec,
  readSpecText,
  regenerate,
  specFileName,
  stripBanner,
  validateSpecObject,
  writeSpec,
} from "../spec/index.js";
import { printCoverageReport } from "./coverage-report.js";

const errorMessage = (err: unknown): string => {
  return err instanceof Error ? err.message : String(err);
};

const findFlag = (args: string[], prefix: string): string | undefined => {
  const flag = args.find((a) => a.startsWith(prefix));
  return flag?.split("=")[1];
};

const findPositional = (args: string[]): string[] => {
  return args.filter((a) => !a.startsWith("--"));
};

/**
 * Top-level dispatcher for `skillet spec <subcommand>`.
 */
export const specCommand = async (args: string[]): Promise<number> => {
  const sub = args[0];
  if (sub == null || sub === "" || sub === "--help" || sub === "-h") {
    printSpecUsage();
    return 0;
  }
  const rest = args.slice(1);

  switch (sub) {
    case "init":
      return specInit(rest);
    case "show":
      return specShow(rest);
    case "refine":
      return specRefine(rest);
    case "import":
      return specImport(rest);
    default:
      console.error(`Unknown spec subcommand: ${sub}`);
      printSpecUsage();
      return 1;
  }
};

const printSpecUsage = (): void => {
  console.log(`
skillet spec — manage spec.yaml (the source of truth)

Subcommands:
  init "<description>" [--path=<dir>]   Generate a new spec from a description (no improve loop)
  show [path]                            Pretty-print the current spec
  refine "<feedback>" [path]             Apply natural-language feedback as spec patches
  import [path]                          Reverse-engineer spec from existing SKILL.md (+ evals)

All mutating subcommands automatically regenerate SKILL.md and evals
from the new spec.
`);
};

// ── init ──────────────────────────────────────────────────

const specInit = async (args: string[]): Promise<number> => {
  const positional = findPositional(args);
  const description = positional.join(" ").trim();
  if (description === "") {
    console.error('Usage: skillet spec init "<description>" [--path=<dir>]');
    return 1;
  }

  const pathArg = findFlag(args, "--path=");
  const skillRoot = resolve(pathArg ?? description.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
  const specPath = join(skillRoot, specFileName());

  if (existsSync(specPath)) {
    console.error(`Error: ${specPath} already exists.`);
    console.error("Use `skillet spec refine` to modify it, or delete it manually.");
    return 1;
  }
  if (sessionExists(skillRoot)) {
    console.error(`Error: a paused spec-author session exists at ${skillRoot}.`);
    console.error("Resume with `skillet resume` or delete `.skillet-session.json` first.");
    return 1;
  }

  const models = resolveModels();
  console.log(`Seeding draft spec from description (${skillRoot})...`);

  let spec;
  try {
    const baseline = await seedFromDescription(models.agent, description);
    const session = createInteractiveSession();
    try {
      const authorResult = await runSpecAuthor({
        model: models.agent,
        baseline,
        transport: session.transport,
      });
      if (!authorResult.accepted) {
        console.error(
          `spec-author loop ended without user acceptance after ${authorResult.turns} turn(s).`,
        );
        return 1;
      }
      spec = authorResult.spec;
    } finally {
      session.close();
    }
  } catch (err: unknown) {
    if (err instanceof SpecAuthorPaused) {
      mkdirSync(skillRoot, { recursive: true });
      return handleSpecAuthorPause({
        err,
        skillRoot,
        seedKind: "from-description",
        seedInput: description,
      });
    }
    console.error(`Error: ${errorMessage(err)}`);
    return 1;
  }

  mkdirSync(skillRoot, { recursive: true });

  try {
    await withStaging(skillRoot, async (stagingDir) => {
      writeSpec(join(stagingDir, specFileName()), spec);
      console.log(`✓ Staged ${specFileName()}`);
      console.log("Regenerating SKILL.md and evals...");
      await regenerate(stagingDir, {
        model: models.agent,
        evalGenModel: models.evalGen,
        onProgress: (msg) => {
          console.log(`  ${msg}`);
        },
      });
    });
  } catch (err: unknown) {
    console.error(`Error during init: ${errorMessage(err)}`);
    console.error("No partial files written.");
    return 1;
  }

  console.log(`\nSpec ready at ${skillRoot}.`);
  printCoverageReport(skillRoot);
  return 0;
};

// ── show ──────────────────────────────────────────────────

const specShow = (args: string[]): number => {
  const pathArg = findPositional(args)[0];
  const skillRoot = resolve(pathArg ?? ".");
  const specPath = join(skillRoot, specFileName());
  const text = readSpecText(specPath);
  if (text == null) {
    console.error(`Error: no ${specFileName()} at ${skillRoot}`);
    return 1;
  }
  console.log(stripBanner(text));
  return 0;
};

// ── refine ────────────────────────────────────────────────

const specRefine = async (args: string[]): Promise<number> => {
  const positional = findPositional(args);
  if (positional.length === 0) {
    console.error('Usage: skillet spec refine "<feedback>" [path]');
    return 1;
  }

  // First positional is the feedback; subsequent positionals are
  // treated as a path if they look like one (contains / or starts
  // with .) — same convention used by add-eval today.
  let feedback = positional[0] ?? "";
  let pathArg: string | undefined;
  for (const arg of positional.slice(1)) {
    if (arg.includes("/") || arg.startsWith(".") || existsSync(arg)) {
      pathArg = arg;
    } else {
      feedback = `${feedback} ${arg}`.trim();
    }
  }

  const skillRoot = resolve(pathArg ?? ".");
  const specPath = join(skillRoot, specFileName());
  const spec = readSpec(specPath);
  if (spec == null) {
    console.error(`Error: no ${specFileName()} at ${skillRoot}`);
    console.error("Run `skillet spec init <description>` or `skillet spec import` first.");
    return 1;
  }

  const models = resolveModels();
  console.log("Generating patches from feedback...");
  let patches;
  try {
    patches = await runSpecRefine(models.agent, spec, feedback);
  } catch (err: unknown) {
    console.error(`Error: ${errorMessage(err)}`);
    return 1;
  }

  if (patches.length === 0) {
    console.log("No patches produced (feedback didn't translate to a spec change).");
    printCoverageReport(skillRoot);
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

  try {
    await withStaging(skillRoot, async (stagingDir) => {
      writeSpec(join(stagingDir, specFileName()), updated);
      console.log(`✓ Staged ${specFileName()}`);
      console.log("Regenerating SKILL.md and evals...");
      await regenerate(stagingDir, {
        model: models.agent,
        evalGenModel: models.evalGen,
        onProgress: (msg) => {
          console.log(`  ${msg}`);
        },
      });
    });
  } catch (err: unknown) {
    console.error(`Error during refine: ${errorMessage(err)}`);
    console.error("Original skill is unchanged.");
    return 1;
  }

  printCoverageReport(skillRoot);
  return 0;
};

// ── import ────────────────────────────────────────────────

const specImport = async (args: string[]): Promise<number> => {
  const pathArg = findPositional(args)[0];
  const skillRoot = resolve(pathArg ?? ".");
  const specPath = join(skillRoot, specFileName());

  if (existsSync(specPath)) {
    console.error(`Error: ${specPath} already exists.`);
    console.error(
      "`spec import` refuses to overwrite. Delete the file or run `spec refine` instead.",
    );
    return 1;
  }

  const skillMdPath = join(skillRoot, "SKILL.md");
  if (!existsSync(skillMdPath)) {
    console.error(`Error: no SKILL.md at ${skillRoot}.`);
    console.error(
      "`spec import` reverse-engineers from an existing SKILL.md. Use `spec init` for new skills.",
    );
    return 1;
  }

  if (sessionExists(skillRoot)) {
    console.error(`Error: a paused spec-author session exists at ${skillRoot}.`);
    console.error("Resume with `skillet resume` or delete `.skillet-session.json` first.");
    return 1;
  }

  const skillMd = readFileSync(skillMdPath, "utf-8");

  const models = resolveModels();
  console.log(`Seeding spec from ${skillMdPath}...`);
  let spec;
  try {
    const baseline = await seedFromSkill(models.agent, skillMd);
    const session = createInteractiveSession();
    try {
      const authorResult = await runSpecAuthor({
        model: models.agent,
        baseline,
        transport: session.transport,
      });
      if (!authorResult.accepted) {
        console.error(
          `spec-author loop ended without user acceptance after ${authorResult.turns} turn(s).`,
        );
        return 1;
      }
      spec = authorResult.spec;
    } finally {
      session.close();
    }
  } catch (err: unknown) {
    if (err instanceof SpecAuthorPaused) {
      return handleSpecAuthorPause({
        err,
        skillRoot,
        seedKind: "from-skill",
        seedInput: skillMd,
      });
    }
    console.error(`Error: ${errorMessage(err)}`);
    return 1;
  }

  // Stage all writes (spec.yaml + SKILL.md + eval files) so a
  // failure during regen leaves the original skill untouched.
  // Pre-fix: writeSpec ran first, then regen — a regen failure
  // left the user with a clobbered SKILL.md and no spec.yaml.
  try {
    await withStaging(skillRoot, async (stagingDir) => {
      writeSpec(join(stagingDir, specFileName()), spec);
      console.log(`✓ Staged ${specFileName()}`);
      console.log("Regenerating SKILL.md and evals from imported spec...");
      await regenerate(stagingDir, {
        model: models.agent,
        evalGenModel: models.evalGen,
        onProgress: (msg) => {
          console.log(`  ${msg}`);
        },
      });
    });
  } catch (err: unknown) {
    console.error(`Error during import: ${errorMessage(err)}`);
    console.error("Original skill is unchanged.");
    return 1;
  }

  console.log("\nImported spec is a faithful capture of SKILL.md, not improved.");
  printCoverageReport(skillRoot);
  return 0;
};
