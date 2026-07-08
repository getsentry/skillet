import { describe, expect, it } from "vitest";
import { checkCoverage } from "./coverage.js";
import { type ParsedSpec } from "./spec/types.js";

const spec: ParsedSpec = {
  name: "S",
  intent: "i",
  triggers: { should: [], shouldNot: [] },
  behaviors: [
    { id: "alpha", name: "Alpha", line: 10, text: "", scenarios: [] },
    { id: "beta", name: "Beta", line: 20, text: "", scenarios: [] },
  ],
  constraints: [],
};

describe("checkCoverage", () => {
  it("warns on uncovered behaviors", () => {
    const issues = checkCoverage(spec, [{ file: "a.yaml", behavior: "alpha" }], new Set());
    expect(issues).toEqual([
      expect.objectContaining({
        severity: "warning",
        message: expect.stringContaining('"beta"'),
        line: 20,
      }),
    ]);
  });

  it("errors on unknown behavior references", () => {
    const issues = checkCoverage(spec, [{ file: "x.yaml", behavior: "gamma" }], new Set());
    const err = issues.find((i) => i.severity === "error");
    expect(err?.message).toContain("x.yaml");
    expect(err?.message).toContain('"gamma"');
    expect(err?.hint).toContain("alpha");
  });

  it("errors on missing fixtures and passes on present ones", () => {
    const issues = checkCoverage(
      spec,
      [
        { file: "a.yaml", behavior: "alpha", fixture: "repo" },
        { file: "b.yaml", behavior: "beta", fixture: "ghost" },
      ],
      new Set(["repo"]),
    );
    expect(issues).toEqual([
      expect.objectContaining({
        severity: "error",
        message: expect.stringContaining('missing fixture "ghost"'),
      }),
    ]);
  });
});
