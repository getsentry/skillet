import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ResolvedHarness } from "../harness/types.js";
import type { EvalCase } from "../evals/case.js";
import { runEngine, type EngineOptions } from "./orchestrate.js";
import type { WorkerCase } from "./types.js";

const dirs: string[] = [];
const makeSkillRoot = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "skillet-engine-test-"));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** An "agent" that just creates the file the prompt names. */
const fakeAgent: ResolvedHarness = {
  name: "fake",
  kind: "custom",
  binary: "sh",
  command: "cd {workspace} && touch {prompt}",
};

const makeCase = (overrides: Partial<EvalCase>): EvalCase => ({
  id: "case-1",
  file: "evals/cases/case-1.yaml",
  behavior: "make-file",
  prompt: "result.txt",
  checks: [{ kind: "file_exists", value: "result.txt" }],
  trials: 1,
  timeout: 30,
  ...overrides,
});

const makeWorkerCase = (evalCase: EvalCase, overrides: Partial<WorkerCase> = {}): WorkerCase => ({
  evalCase,
  harness: fakeAgent,
  skillRoot: makeSkillRoot(),
  trials: evalCase.trials,
  baseline: false,
  keepWorkspaces: false,
  ...overrides,
});

// Each test boots a nested vitest instance; well beyond unit-test speed.
const SLOW = 60_000;

type TestEngineOptions = Omit<EngineOptions, "concurrency"> & { concurrency?: number };
const runCases = (
  workerCases: WorkerCase[],
  options: TestEngineOptions = {},
): ReturnType<typeof runEngine> => {
  const { concurrency = 4, ...rest } = options;
  return runEngine(workerCases, { concurrency, ...rest });
};

describe("runEngine", () => {
  it("passes when the agent produces the checked artifact", { timeout: SLOW }, async () => {
    const results = await runCases([makeWorkerCase(makeCase({}))], { concurrency: 4 });
    expect(results[0]?.trials[0]?.status).toBe("pass");
    expect(results[0]?.trials[0]?.checks[0]?.status).toBe("pass");
  });

  it("fails when checks are not satisfied", { timeout: SLOW }, async () => {
    const results = await runCases([
      makeWorkerCase(makeCase({ checks: [{ kind: "file_exists", value: "other.txt" }] })),
    ]);
    expect(results[0]?.trials[0]?.status).toBe("fail");
    const check = results[0]?.trials[0]?.checks[0];
    expect(check?.status === "fail" && check.output).toContain("no such path");
  });

  it(
    "marks setup failures as errored, not failed, and keeps running",
    { timeout: SLOW },
    async () => {
      const skillRoot = makeSkillRoot();
      const results = await runCases([
        makeWorkerCase(makeCase({ id: "bad", setup: "exit 9" }), { skillRoot }),
        makeWorkerCase(makeCase({ id: "good" }), { skillRoot }),
      ]);
      const bad = results.find((r) => r.id === "bad")?.trials[0];
      expect(bad?.status).toBe("error");
      expect(bad?.status === "error" && bad.error).toContain("setup script failed");
      expect(results.find((r) => r.id === "good")?.trials[0]?.status).toBe("pass");
    },
  );

  it("skips judge checks when a deterministic check fails", { timeout: SLOW }, async () => {
    const results = await runCases([
      makeWorkerCase(
        makeCase({
          checks: [
            { kind: "file_exists", value: "missing.txt" },
            { kind: "judge", value: "should be skipped" },
          ],
        }),
      ),
    ]);
    const checks = results[0]?.trials[0]?.checks ?? [];
    expect(checks.find((c) => c.kind === "judge")?.status).toBe("skipped");
    expect(results[0]?.trials[0]?.status).toBe("fail");
  });

  it(
    "treats a nonzero harness exit as an error, not a skill failure",
    { timeout: SLOW },
    async () => {
      const dying: ResolvedHarness = {
        name: "dying",
        kind: "custom",
        binary: "sh",
        command: "echo boot failure >&2; false # {workspace} {prompt}",
      };
      const results = await runCases([makeWorkerCase(makeCase({}), { harness: dying })]);
      const trial = results[0]?.trials[0];
      expect(trial?.status).toBe("error");
      expect(trial?.status === "error" && trial.error).toContain("harness exited with code 1");
      expect(trial?.checks).toEqual([]);
    },
  );

  it(
    "runs baseline trials without the skill and honors trial count",
    { timeout: SLOW },
    async () => {
      // A skill-dir-installing harness makes skill presence observable:
      // the check passes only when the skill was installed, so baseline
      // trials proving "fail" proves they ran skill-less.
      const skillRoot = makeSkillRoot();
      writeFileSync(join(skillRoot, "SKILL.md"), "---\nname: s\ndescription: d\n---\n");
      const installing: ResolvedHarness = {
        name: "installing",
        kind: "custom",
        binary: "sh",
        command: "true # {workspace} {prompt}",
        skillDir: "{workspace}/.skill",
      };
      const results = await runCases([
        makeWorkerCase(makeCase({ checks: [{ kind: "file_exists", value: ".skill/SKILL.md" }] }), {
          skillRoot,
          harness: installing,
          trials: 3,
          baseline: true,
        }),
      ]);
      expect(results[0]?.trials).toHaveLength(3);
      expect(results[0]?.baselineTrials).toHaveLength(3);
      expect(results[0]?.trials.every((t) => t.status === "pass")).toBe(true);
      expect(results[0]?.baselineTrials?.every((t) => t.status === "fail")).toBe(true);
    },
  );

  it("reports each case exactly once via onCaseDone", { timeout: SLOW }, async () => {
    const skillRoot = makeSkillRoot();
    const done: string[] = [];
    await runCases(
      [
        makeWorkerCase(makeCase({ id: "a" }), { skillRoot }),
        makeWorkerCase(makeCase({ id: "b" }), { skillRoot }),
      ],
      { onCaseDone: (r) => done.push(r.id) },
    );
    expect(done.toSorted()).toEqual(["a", "b"]);
  });

  it("returns case results in declared order", { timeout: SLOW }, async () => {
    const skillRoot = makeSkillRoot();
    const results = await runCases([
      makeWorkerCase(makeCase({ id: "z-first" }), { skillRoot }),
      makeWorkerCase(makeCase({ id: "a-second" }), { skillRoot }),
    ]);
    expect(results.map((result) => result.id)).toEqual(["z-first", "a-second"]);
  });

  it("caps concurrent trials at four", { timeout: SLOW }, async () => {
    const skillRoot = makeSkillRoot();
    const barrier = makeSkillRoot();
    mkdirSync(join(barrier, "active"));
    mkdirSync(join(barrier, "started"));
    const concurrentHarness: ResolvedHarness = {
      name: "concurrent",
      kind: "custom",
      binary: "sh",
      command: `cd {workspace}; touch ${barrier}/active/$$ ${barrier}/started/$$; active=$(find ${barrier}/active -type f | wc -l | tr -d ' '); test "$active" -le 4 || touch ${barrier}/exceeded; attempts=0; while [ $attempts -lt 100 ]; do test "$(find ${barrier}/started -type f | wc -l | tr -d ' ')" -ge 4 && break; attempts=$((attempts + 1)); sleep 0.01; done; sleep 0.05; rm -f ${barrier}/active/$$; test ! -f ${barrier}/exceeded # {prompt}`,
    };
    const results = await runCases([
      makeWorkerCase(makeCase({ checks: [{ kind: "shell", value: "true" }] }), {
        skillRoot,
        harness: concurrentHarness,
        trials: 5,
      }),
    ]);
    expect(results).toHaveLength(1);
    expect(results[0]?.trials).toHaveLength(5);
    expect(results[0]?.trials.every((trial) => trial.status === "pass")).toBe(true);
    expect(existsSync(join(barrier, "exceeded"))).toBe(false);
  });

  it(
    "honors serial concurrency across skill and baseline variants",
    { timeout: SLOW },
    async () => {
      const skillRoot = makeSkillRoot();
      const barrier = makeSkillRoot();
      writeFileSync(join(skillRoot, "SKILL.md"), "---\nname: s\ndescription: d\n---\n");
      const serialHarness: ResolvedHarness = {
        name: "serial",
        kind: "custom",
        binary: "sh",
        command: `cd {workspace}; if ! mkdir ${barrier}/lock 2>/dev/null; then touch ${barrier}/overlap; fi; sleep 0.05; rmdir ${barrier}/lock 2>/dev/null || true; test ! -f ${barrier}/overlap # {prompt}`,
      };
      const results = await runCases(
        [
          makeWorkerCase(makeCase({ checks: [{ kind: "shell", value: "true" }] }), {
            skillRoot,
            harness: serialHarness,
            baseline: true,
          }),
        ],
        { concurrency: 1 },
      );
      expect(results[0]?.trials[0]?.status).toBe("pass");
      expect(results[0]?.baselineTrials?.[0]?.status).toBe("pass");
      expect(existsSync(join(barrier, "overlap"))).toBe(false);
    },
  );

  it("rejects invalid programmatic concurrency", async () => {
    for (const concurrency of [0, 1.5, 9]) {
      await expect(runEngine([makeWorkerCase(makeCase({}))], { concurrency })).rejects.toThrow(
        /concurrency must be an integer from 1 to 8/,
      );
    }
  });

  it("writes a vitest JSON report when asked", { timeout: SLOW }, async () => {
    const reportFile = join(makeSkillRoot(), "report.json");
    await runCases([makeWorkerCase(makeCase({}))], { reportFile });
    const { readFileSync } = await import("node:fs");
    const report = JSON.parse(readFileSync(reportFile, "utf8")) as {
      numTotalTests: number;
      success: boolean;
    };
    expect(report.numTotalTests).toBe(1);
    expect(report.success).toBe(true);
  });
});
