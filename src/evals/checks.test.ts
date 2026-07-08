import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCheck } from "./checks.js";

let ws = "";

beforeAll(() => {
  ws = mkdtempSync(join(tmpdir(), "skillet-checks-"));
  writeFileSync(join(ws, "present.txt"), "content");
});

afterAll(() => {
  rmSync(ws, { recursive: true, force: true });
});

describe("runCheck", () => {
  it("passes file_exists for present paths and fails for absent ones", () => {
    expect(runCheck({ kind: "file_exists", value: "present.txt" }, ws).status).toBe("pass");
    const missing = runCheck({ kind: "file_exists", value: "ghost.txt" }, ws);
    expect(missing.status === "fail" && missing.output).toContain("ghost.txt");
  });

  it("passes shell checks on exit 0 and fails otherwise with output", () => {
    expect(runCheck({ kind: "shell", value: "grep -q content present.txt" }, ws).status).toBe(
      "pass",
    );
    const fail = runCheck({ kind: "shell", value: "echo mismatch; exit 2" }, ws);
    expect(fail.status === "fail" && fail.output).toContain("exit 2");
    expect(fail.status === "fail" && fail.output).toContain("mismatch");
  });

  it("runs shell checks with the workspace as cwd", () => {
    const result = runCheck(
      { kind: "shell", value: `test "$(pwd)" = "${ws}" || test -f present.txt` },
      ws,
    );
    expect(result.status).toBe("pass");
  });

  it("skips judge checks — the runner grades them through the harness", () => {
    expect(runCheck({ kind: "judge", value: "criterion" }, ws).status).toBe("skipped");
  });
});
