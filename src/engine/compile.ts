import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { WorkerCase } from "./types.js";

export interface CompiledRun {
  /** Directory holding the generated eval files — vitest's root. */
  dir: string;
  cleanup: () => void;
}

/**
 * The worker module generated files import. Bundled, this code lives
 * inside dist/cli.js so import.meta.url puts worker.js beside it;
 * from source (tests), import.meta.url is this file and worker.ts
 * sits beside it (vitest transforms TS imports on the fly).
 */
export const resolveWorkerUrl = (): string => {
  const candidates = [new URL("worker.js", import.meta.url), new URL("worker.ts", import.meta.url)];
  for (const candidate of candidates) {
    if (existsSync(fileURLToPath(candidate))) return candidate.href;
  }
  throw new Error("skillet engine worker module not found next to the CLI — broken installation");
};

/**
 * Compile cases into one generated eval file each, in a temp dir the
 * skill directory never sees (eval-engine spec, "Engine files stay
 * out of the skill directory"). The WorkerCase is embedded as JSON —
 * workers share no memory with the CLI process.
 */
export const compileCases = (cases: WorkerCase[], workerUrl: string): CompiledRun => {
  const dir = mkdtempSync(join(tmpdir(), "skillet-engine-"));
  for (const workerCase of cases) {
    const source = [
      `import { registerCase } from ${JSON.stringify(workerUrl)};`,
      `registerCase(${JSON.stringify(workerCase)});`,
      ``,
    ].join("\n");
    writeFileSync(join(dir, `${workerCase.evalCase.id}.eval.mjs`), source);
  }
  return {
    dir,
    cleanup: (): void => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
};
