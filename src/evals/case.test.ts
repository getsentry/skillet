import { describe, expect, it } from "vitest";
import { parseCase } from "./case.js";

const VALID = `behavior: commit-message-format
prompt: |
  Commit my staged changes.
fixture: git-repo
setup: |
  git init -q
checks:
  - shell: "git log -1 --format=%s | grep -q '^feat:'"
  - file_exists: "README.md"
  - judge: "The commit message follows conventional commit format"
trials: 3
timeout: 120
`;

describe("parseCase", () => {
  it("parses a full case", () => {
    const { evalCase, issues } = parseCase("evals/cases/commit.yaml", VALID);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(evalCase).toMatchObject({
      id: "commit",
      behavior: "commit-message-format",
      fixture: "git-repo",
      trials: 3,
      timeout: 120,
    });
    expect(evalCase?.checks.map((c) => c.kind)).toEqual(["shell", "file_exists", "judge"]);
  });

  it("accepts a minimal case with defaults", () => {
    const { evalCase, issues } = parseCase(
      "evals/cases/min.yaml",
      'behavior: b\nprompt: p\nchecks:\n  - file_exists: "x"\n',
    );
    expect(issues).toEqual([]);
    expect(evalCase).toMatchObject({ trials: 1, timeout: 300 });
    expect(evalCase?.fixture).toBeUndefined();
  });

  it("rejects missing behavior and prompt", () => {
    const { evalCase, issues } = parseCase("evals/cases/x.yaml", "checks: []\n");
    expect(evalCase).toBeNull();
    const msgs = issues.map((i) => i.message);
    expect(msgs.some((m) => m.includes('"behavior"'))).toBe(true);
    expect(msgs.some((m) => m.includes('"prompt"'))).toBe(true);
  });

  it("rejects unsupported check types with a hint", () => {
    const { evalCase, issues } = parseCase(
      "evals/cases/x.yaml",
      'behavior: b\nprompt: p\nchecks:\n  - regex: "foo.*"\n',
    );
    expect(evalCase).toBeNull();
    const err = issues.find((i) => i.message.includes('unsupported type "regex"'));
    expect(err?.hint).toContain("file_exists, shell, judge");
  });

  it("rejects invalid YAML with the parse error", () => {
    const { evalCase, issues } = parseCase("evals/cases/x.yaml", "behavior: [unclosed\n");
    expect(evalCase).toBeNull();
    expect(issues[0]?.message).toContain("invalid YAML");
  });

  it("rejects non-positive trials and timeout", () => {
    const { issues } = parseCase(
      "evals/cases/x.yaml",
      "behavior: b\nprompt: p\ntrials: 0\ntimeout: -5\n",
    );
    const msgs = issues.filter((i) => i.severity === "error").map((i) => i.message);
    expect(msgs.some((m) => m.includes('"trials"'))).toBe(true);
    expect(msgs.some((m) => m.includes('"timeout"'))).toBe(true);
  });

  it("warns on unknown fields and rejects checkless cases", () => {
    const { evalCase, issues } = parseCase(
      "evals/cases/x.yaml",
      "behavior: b\nprompt: p\nthreshold: 0.75\n",
    );
    expect(evalCase).toBeNull();
    const warnings = issues.filter((i) => i.severity === "warning").map((i) => i.message);
    expect(warnings.some((m) => m.includes('unknown field "threshold"'))).toBe(true);
    const errors = issues.filter((i) => i.severity === "error").map((i) => i.message);
    expect(errors.some((m) => m.includes("no checks"))).toBe(true);
  });
});
