import { describe, expect, it } from "vitest";
import { instructionsFor } from "./content.js";

describe("eval instructions", () => {
  it("distinguishes deterministic proof from semantic proxies", () => {
    const instructions = instructionsFor("evals").instructions;

    expect(instructions).toContain("directly prove an observable requirement");
    expect(instructions).toContain("Do not use grep or string presence as a proxy");
    expect(instructions).toContain("any deterministic failure skips the judge");
    expect(instructions).toContain("A judge-only case is valid");
    expect(instructions).toContain("compare the observed pass rates");
    expect(instructions).not.toContain("grep committed files");
    expect(instructions).not.toContain("proves nothing");
    expect(instructions).not.toContain("lift is positive");
  });

  it("allows authoring meta-content when the skill owns that domain", () => {
    const instructions = instructionsFor("skill").instructions;

    expect(instructions).toContain("only when the skill's own purpose requires them");
    expect(instructions).not.toContain("nothing about specs, evals, skillet");
  });
});
