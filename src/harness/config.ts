import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { isRecord } from "../guards.js";
import type { BuiltinHarness, ResolvedHarness } from "./types.js";

export const CONFIG_FILE = ".skillet.yaml";

export class HarnessConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HarnessConfigError";
  }
}

const CODEX: BuiltinHarness = { name: "codex", kind: "codex", binary: "codex" };
const CLAUDE: BuiltinHarness = { name: "claude", kind: "claude", binary: "claude" };

const BUILTINS: Record<string, BuiltinHarness> = { codex: CODEX, claude: CLAUDE };

/** Find the nearest .skillet.yaml walking up from `startDir`. */
export const findConfig = (startDir: string): string | null => {
  let dir = startDir;
  for (;;) {
    const candidate = join(dir, CONFIG_FILE);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
};

/**
 * Load and parse the nearest .skillet.yaml once; the harness and
 * sandbox resolvers both read from this, so parse errors surface
 * through one channel and the file is read once per run.
 */
export const loadConfig = (skillRoot: string): Record<string, unknown> => {
  const configPath = findConfig(skillRoot);
  if (configPath == null) return {};
  let parsed: unknown;
  try {
    parsed = parseYaml(readFileSync(configPath, "utf8"));
  } catch (cause) {
    throw new HarnessConfigError(
      `${configPath} is not valid YAML: ${cause instanceof Error ? cause.message.split("\n")[0] : String(cause)}`,
    );
  }
  return isRecord(parsed) ? parsed : {};
};

/**
 * Turn a config `harness:` value into a ResolvedHarness (harness spec,
 * "Custom harness via command template"). Accepts a builtin name or a
 * mapping with a command template.
 */
/** "claude:sonnet" selects the claude builtin running the sonnet model. */
const parseBuiltin = (value: string): ResolvedHarness | null => {
  const [name, model] = value.split(":", 2);
  const builtin = name != null ? BUILTINS[name] : undefined;
  if (builtin == null) return null;
  if (model != null && model !== "") {
    return { ...builtin, name: value, model };
  }
  return builtin;
};

export const parseHarness = (value: unknown): ResolvedHarness => {
  if (typeof value === "string") {
    const builtin = parseBuiltin(value);
    if (builtin == null) {
      throw new HarnessConfigError(
        `unknown harness "${value}" — built-ins are ${Object.keys(BUILTINS).join(", ")} (optionally with a model, e.g. claude:sonnet); custom harnesses use a mapping with a "command" template`,
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
export const resolveHarness = (config: Record<string, unknown>, flag?: string): ResolvedHarness => {
  if (flag != null) {
    const builtin = parseBuiltin(flag);
    if (builtin == null) {
      throw new HarnessConfigError(
        `--harness accepts ${Object.keys(BUILTINS).join(", ")}, optionally with a model (claude:sonnet); configure custom harnesses in ${CONFIG_FILE}`,
      );
    }
    return builtin;
  }
  if (config["harness"] != null) {
    return parseHarness(config["harness"]);
  }
  return CODEX;
};

/** Fail fast when the harness executable is missing (harness spec). */
export const requireBinary = (harness: ResolvedHarness): void => {
  try {
    execFileSync("sh", ["-c", 'command -v "$1"', "sh", harness.binary], {
      stdio: "ignore",
      timeout: 10_000,
    });
  } catch {
    throw new HarnessConfigError(
      `harness "${harness.name}" needs "${harness.binary}" on PATH — install it or switch harnesses (--harness, or "harness:" in ${CONFIG_FILE})`,
    );
  }
};
