import { resolve } from "node:path";
import { validateSkill } from "../skill/validator.js";

export const validateCommand = (pathArg?: string, jsonOutput = false): number => {
  const startPath = resolve(pathArg ?? ".");
  const result = validateSkill(startPath);

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
    return result.valid ? 0 : 1;
  }

  if (result.valid) {
    console.log("\x1b[32m✓\x1b[0m Skill is valid");
    return 0;
  }

  console.log(
    `\x1b[31m✗\x1b[0m Validation failed (${result.errors.length} error${result.errors.length === 1 ? "" : "s"}):\n`,
  );
  for (const err of result.errors) {
    console.log(`  ${err.path}`);
    console.log(`    ${err.message}\n`);
  }

  return 1;
};
