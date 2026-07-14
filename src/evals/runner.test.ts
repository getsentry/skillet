import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { EvalCase } from "./case.js";
import { summarizeByBehavior, type TrialResult } from "./results.js";
import { dryRun } from "./runner.js";

const dirs: string[] = [];
const makeSkillRoot = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "skillet-runner-"));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

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

const trial = (status: TrialResult["status"]): TrialResult => {
  const base = { checks: [], transcript: "", durationMs: 0 };
  return status === "error" ? { ...base, status, error: "boom" } : { ...base, status };
};

describe("dryRun", () => {
  it("flags a case as vacuous when every deterministic check passes pristine", () => {
    const results = dryRun(
      [
        makeCase({
          id: "vacuous",
          setup: "touch already-there.txt",
          checks: [
            { kind: "file_exists", value: "already-there.txt" },
            { kind: "judge", value: "cannot dry-run" },
          ],
        }),
      ],
      makeSkillRoot(),
    );
    expect(results[0]?.vacuous).toBe(true);
    expect(results[0]?.pristinePass).toEqual([{ kind: "file_exists", value: "already-there.txt" }]);
    expect(results[0]?.judges).toBe(1);
  });

  it("reports a setup failure on the case and keeps dry-running the rest", () => {
    const results = dryRun(
      [makeCase({ id: "broken", setup: "exit 3" }), makeCase({ id: "fine" })],
      makeSkillRoot(),
    );
    expect(results[0]?.error).toContain("setup script failed");
    expect(results[0]?.vacuous).toBe(false);
    expect(results[1]?.id).toBe("fine");
    expect(results[1]?.error).toBeUndefined();
  });

  it("allows invariant guards as long as some check demands agent work", () => {
    const results = dryRun(
      [
        makeCase({
          setup: "touch invariant.txt",
          checks: [
            { kind: "file_exists", value: "invariant.txt" },
            { kind: "file_exists", value: "agent-must-make-this.txt" },
          ],
        }),
      ],
      makeSkillRoot(),
    );
    expect(results[0]?.vacuous).toBe(false);
    expect(results[0]?.pristinePass).toHaveLength(1);
  });
});

describe("summarizeByBehavior", () => {
  it("computes pass rates and baseline lift per behavior", () => {
    const summaries = summarizeByBehavior([
      {
        id: "a",
        behavior: "b1",
        trials: [trial("pass"), trial("pass"), trial("fail"), trial("error")],
        baselineTrials: [trial("fail"), trial("fail"), trial("pass"), trial("fail")],
      },
      { id: "c", behavior: "b2", trials: [trial("pass")] },
    ]);
    const b1 = summaries.find((s) => s.behavior === "b1");
    expect(b1).toMatchObject({ cases: 1, trials: 4, passed: 2, passRate: 0.5 });
    expect(b1?.baselinePassRate).toBe(0.25);
    expect(b1?.lift).toBe(0.25);
    const b2 = summaries.find((s) => s.behavior === "b2");
    expect(b2?.passRate).toBe(1);
    expect(b2?.lift).toBeUndefined();
  });
});
