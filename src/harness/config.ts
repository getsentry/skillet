import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { ResolvedHarness } from "./types.js";

export const CONFIG_FILE = ".skillet.yaml";

export class HarnessConfigError extends Error {}

const BUILTINS: Record<string, ResolvedHarness> = {
  codex: { name: "codex", kind: "codex", binary: "codex" },
  claude: { name: "claude", kind: "claude", binary: "claude" },
};

export const DEFAULT_HARNESS = "codex";

const isRecord = (v: unknown): v is Record<string, unknown> => {
  return v != null && typeof v === "object" && !Array.isArray(v);
};

/** Find the nearest .skillet.yaml walking up from `startDir`. */
export const findConfig = (startDir: string): string | null => {
  let dir = startDir;
  for (let i = 0; i < 50; i++) {
    const candidate = join(dir, CONFIG_FILE);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
};

/**
 * Turn a config `harness:` value into a ResolvedHarness (harness spec,
 * "Custom harness via command template"). Accepts a builtin name or a
 * mapping with a command template.
 */
export const resolveHarnessValue = (value: unknown): ResolvedHarness => {
  if (typeof value === "string") {
    const builtin = BUILTINS[value];
    if (builtin == null) {
      throw new HarnessConfigError(
        `unknown harness "${value}" — built-ins are ${Object.keys(BUILTINS).join(", ")}; custom harnesses use a mapping with a "command" template`,
      );
    }
    return builtin;
  }
  if (isRecord(value)) {
    const command = value["command"];
    if (typeof command !== "string" || command.trim() === "") {
      throw new HarnessConfigError('custom harness needs a non-empty "command" template');
    }
    for (const placeholder of ["{workspace}", "{prompt}"]) {
      if (!command.includes(placeholder)) {
        throw new HarnessConfigError(
          `custom harness command template is missing the ${placeholder} placeholder`,
        );
      }
    }
    const binary = command.trim().split(/\s+/)[0] ?? "";
    const name = typeof value["name"] === "string" ? value["name"] : "custom";
    const skillDir = value["skill_dir"];
    if (skillDir != null && typeof skillDir !== "string") {
      throw new HarnessConfigError('custom harness "skill_dir" must be a string template');
    }
    return {
      name,
      kind: "custom",
      binary,
      command,
      ...(typeof skillDir === "string" && { skillDir }),
    };
  }
  throw new HarnessConfigError('"harness" must be a builtin name or a mapping with "command"');
};

/**
 * Resolve the harness for a run: CLI flag > .skillet.yaml > default
 * codex. The flag accepts builtin names only; custom harnesses are
 * configured in .skillet.yaml.
 */
export const resolveHarness = (skillRoot: string, flag?: string): ResolvedHarness => {
  if (flag != null) {
    const builtin = BUILTINS[flag];
    if (builtin == null) {
      throw new HarnessConfigError(
        `--harness accepts ${Object.keys(BUILTINS).join(", ")}; configure custom harnesses in ${CONFIG_FILE}`,
      );
    }
    return builtin;
  }
  const configPath = findConfig(skillRoot);
  if (configPath != null) {
    let parsed: unknown;
    try {
      parsed = parseYaml(readFileSync(configPath, "utf-8"));
    } catch (err) {
      throw new HarnessConfigError(
        `${configPath} is not valid YAML: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`,
      );
    }
    if (isRecord(parsed) && parsed["harness"] != null) {
      return resolveHarnessValue(parsed["harness"]);
    }
  }
  const fallback = BUILTINS[DEFAULT_HARNESS];
  if (fallback == null) throw new HarnessConfigError("no default harness");
  return fallback;
};

/** Fail fast when the harness executable is missing (harness spec). */
export const assertBinaryAvailable = (harness: ResolvedHarness): void => {
  try {
    execFileSync("sh", ["-c", `command -v ${harness.binary}`], { stdio: "ignore" });
  } catch {
    throw new HarnessConfigError(
      `harness "${harness.name}" needs "${harness.binary}" on PATH — install it or switch harnesses (--harness, or "harness:" in ${CONFIG_FILE})`,
    );
  }
};
