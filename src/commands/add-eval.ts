import { resolve, join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { findSkillRoot, loadSkill } from "../skill/loader.js";
import { resolveModels } from "../agent/provider.js";
import { loadEvalExamples } from "../authoring/references.js";
import { generateEvalYamlWithRetry } from "../authoring/eval-gen.js";

const buildAddEvalPrompt = (): string => {
  const examples = loadEvalExamples();

  return `You are an expert at writing eval cases for agent skills.
You will receive:
1. A SKILL.md file
2. One or more behavior descriptions — each describes a specific behavior to test

For each behavior description, produce one eval case in YAML format.
The cases should be appended to an existing eval file, so output ONLY
the case entries (indented under an \`evals:\` key), not a full file.

Follow this eval format:

${examples}

---

## Rules

- Each behavior description becomes exactly one eval case
- The case name should be descriptive and specific
- Use structural checks (output_contains, output_not_contains, workspace checks) where possible
- Use LLM judge criteria only for subjective quality
- Include workspace setup if the agent needs files to work with
- Match the style and complexity of the existing eval cases if any are provided

Output ONLY the YAML cases. No explanations, no markdown fences.
Start with \`evals:\`.`;
};

export const addEvalCommand = async (args: string[]): Promise<number> => {
  // Parse: skillet add-eval [path] "behavior 1" "behavior 2" ... [--file=custom.eval.yaml]
  const fileFlag = args.find((a) => a.startsWith("--file="));
  const evalFileName = fileFlag?.split("=")[1] ?? "basic.eval.yaml";

  const nonFlags = args.filter((a) => !a.startsWith("--"));

  // First non-flag arg that looks like a path (contains / or . or is a directory)
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
    console.error(
      'Usage: skillet add-eval [path] "behavior description" ["another behavior"] [--file=name.eval.yaml]',
    );
    console.error("");
    console.error("Examples:");
    console.error('  skillet add-eval "should recommend select_related for FK access in loops"');
    console.error(
      '  skillet add-eval ./my-skill "handles empty input gracefully" "errors on invalid YAML"',
    );
    return 1;
  }

  const startPath = resolve(skillPath ?? ".");

  let skillRoot: string;
  try {
    skillRoot = findSkillRoot(startPath);
  } catch {
    console.error(`Error: No SKILL.md found at ${startPath}`);
    return 1;
  }

  const skill = loadSkill(skillRoot);
  const skillContent = readFileSync(join(skillRoot, "SKILL.md"), "utf-8");

  console.log(`Skill: ${skill.meta.name}`);
  console.log(
    `Generating ${descriptions.length} eval case${descriptions.length === 1 ? "" : "s"}...`,
  );

  // Check for existing evals to provide as context
  const evalsDir = join(skillRoot, "evals");
  const evalFilePath = join(evalsDir, evalFileName);
  let existingEvals = "";
  if (existsSync(evalFilePath)) {
    existingEvals = readFileSync(evalFilePath, "utf-8");
  }

  const models = resolveModels();

  const descriptionsText = descriptions.map((d, i) => `${i + 1}. ${d}`).join("\n");

  const userContent = [
    "## SKILL.md\n",
    skillContent,
    existingEvals !== "" ? `\n## Existing Eval Cases (match this style)\n\n${existingEvals}` : "",
    `\n## Behavior Descriptions (generate one eval case per description)\n\n${descriptionsText}`,
  ].join("\n");

  let generated: string;
  try {
    generated = await generateEvalYamlWithRetry({
      model: models.agent,
      systemPrompt: buildAddEvalPrompt(),
      initialUserContent: userContent,
      logProgress: (msg) => {
        console.log(`\x1b[2m  ${msg}\x1b[0m`);
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${msg}`);
    return 1;
  }

  // Merge into existing file or create new
  mkdirSync(evalsDir, { recursive: true });

  if (existingEvals !== "") {
    // Append the new cases to existing file.
    // The generated YAML starts with "evals:" — extract just the cases.
    const casesOnly = generated.replace(/^evals:\s*\n/, "");
    const merged = existingEvals.trimEnd() + "\n\n" + casesOnly;
    writeFileSync(evalFilePath, merged, "utf-8");
    console.log(`\x1b[32m✓\x1b[0m Appended to ${evalFilePath}`);
  } else {
    writeFileSync(evalFilePath, generated, "utf-8");
    console.log(`\x1b[32m✓\x1b[0m Written to ${evalFilePath}`);
  }

  return 0;
};
