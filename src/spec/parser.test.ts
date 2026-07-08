import { describe, expect, it } from "vitest";
import { parseSpec } from "./parser.js";
import { specTemplate } from "./template.js";
import type { Issue } from "./types.js";

const VALID = `# Commit Helper

## Intent

Make the agent write conventional commits with clean, reviewable bodies.

## Triggers

- **SHOULD** trigger when the user asks to commit changes
- **SHOULD NOT** trigger when the user asks to review a diff

## Behaviors

### Behavior: Commit message format

The agent SHALL write commit subjects in imperative mood under 70 characters.

#### Scenario: Simple change

- **WHEN** the user asks to commit a small bug fix
- **THEN** the commit subject starts with "fix" and stays under 70 characters

### Behavior: Branch safety

The agent MUST create a feature branch when on main.

#### Scenario: On main

- **WHEN** the working copy is on the main branch
- **THEN** a feature branch is created before committing

## Constraints

### Constraint: No force push

The agent MUST NOT force-push to shared branches.
`;

const errors = (issues: Issue[]): Issue[] => issues.filter((i) => i.severity === "error");

describe("parseSpec", () => {
  it("parses a valid spec with no errors", () => {
    const { spec, issues } = parseSpec(VALID);
    expect(errors(issues)).toEqual([]);
    expect(spec?.name).toBe("Commit Helper");
    expect(spec?.intent).toContain("conventional commits");
    expect(spec?.triggers.should).toHaveLength(1);
    expect(spec?.triggers.shouldNot).toHaveLength(1);
    expect(spec?.behaviors.map((b) => b.id)).toEqual(["commit-message-format", "branch-safety"]);
    expect(spec?.behaviors[0]?.scenarios[0]?.when).toEqual([
      "the user asks to commit a small bug fix",
    ]);
    expect(spec?.behaviors[0]?.scenarios[0]?.then).toHaveLength(1);
    expect(spec?.constraints.map((c) => c.id)).toEqual(["no-force-push"]);
  });

  it("derives slugs from behavior names", () => {
    const { spec } = parseSpec(VALID.replace("Commit message format", "Commit Message Format!"));
    expect(spec?.behaviors[0]?.id).toBe("commit-message-format");
  });

  it("errors on a behavior with no scenarios", () => {
    const broken = VALID.replace(
      /#### Scenario: On main\n\n- \*\*WHEN\*\*[^\n]*\n- \*\*THEN\*\*[^\n]*\n/,
      "",
    );
    const { issues } = parseSpec(broken);
    const err = errors(issues).find((i) => i.message.includes('"Branch safety" has no scenarios'));
    expect(err).toBeDefined();
    expect(err?.hint).toContain("exactly four hashes");
    expect(err?.line).toBeGreaterThan(0);
  });

  it("errors on a three-hash scenario with a fix hint and line number", () => {
    const broken = VALID.replace("#### Scenario: On main", "### Scenario: On main");
    const { issues } = parseSpec(broken);
    const err = errors(issues).find((i) => i.message.includes("Scenario heading has 3 hashes"));
    expect(err).toBeDefined();
    expect(err?.hint).toContain('"#### Scenario: <name>"');
    expect(err?.line).toBe(VALID.split("\n").findIndex((l) => l.includes("Scenario: On main")) + 1);
  });

  it("errors on duplicate identifiers naming both lines", () => {
    const broken = VALID.replace(
      "### Behavior: Branch safety",
      "### Behavior: Commit message format",
    );
    const { issues } = parseSpec(broken);
    const err = errors(issues).find((i) =>
      i.message.includes('Duplicate identifier "commit-message-format"'),
    );
    expect(err).toBeDefined();
    expect(err?.message).toMatch(/lines \d+ and \d+/);
  });

  it("errors on scenarios missing WHEN or THEN bullets", () => {
    const broken = VALID.replace("- **WHEN** the working copy is on the main branch\n", "");
    const { issues } = parseSpec(broken);
    expect(errors(issues).some((i) => i.message.includes('"On main" has no WHEN bullet'))).toBe(
      true,
    );
  });

  it("errors on missing required sections", () => {
    const { issues } = parseSpec("# Skill\n\n## Intent\n\nSomething.\n");
    const msgs = errors(issues).map((i) => i.message);
    expect(msgs).toContain('Missing required section "## Triggers"');
    expect(msgs).toContain('Missing required section "## Behaviors"');
  });

  it("errors on a missing title", () => {
    const { spec, issues } = parseSpec("## Intent\n\nX.\n");
    expect(spec).toBeNull();
    expect(errors(issues).some((i) => i.message.includes("Missing top-level title"))).toBe(true);
  });

  it("warns on behaviors without SHALL/MUST", () => {
    const soft = VALID.replace("The agent SHALL write", "The agent writes");
    const { issues } = parseSpec(soft);
    expect(
      issues.some((i) => i.severity === "warning" && i.message.includes("no SHALL/MUST")),
    ).toBe(true);
  });

  it("ignores headings inside code fences", () => {
    const fenced = VALID.replace(
      "The agent MUST create a feature branch when on main.",
      "The agent MUST create a feature branch when on main.\n\n```bash\n# not a heading\n### Scenario: also not real\n```",
    );
    const { spec, issues } = parseSpec(fenced);
    expect(errors(issues)).toEqual([]);
    expect(spec?.behaviors[1]?.scenarios).toHaveLength(1);
  });

  it("accepts GIVEN/AND bullets as scenario setup and outcome", () => {
    const given = VALID.replace(
      "- **WHEN** the working copy is on the main branch",
      "- **GIVEN** a repo checked out on main\n- **WHEN** the working copy is on the main branch\n- **AND** no branch exists yet",
    );
    const { spec, issues } = parseSpec(given);
    expect(errors(issues)).toEqual([]);
    const scenario = spec?.behaviors[1]?.scenarios[0];
    expect(scenario?.when).toHaveLength(2);
    expect(scenario?.then).toHaveLength(2);
  });

  it("the shipped template parses with errors only for unfilled placeholders", () => {
    const { spec } = parseSpec(specTemplate("My Skill"));
    expect(spec?.name).toBe("My Skill");
  });
});
