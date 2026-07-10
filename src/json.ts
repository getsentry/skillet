/**
 * The wire types behind every `--json` output. These are the machine
 * interface the generated /skillet:* workflows consume — changing a
 * field here is a breaking change for agent consumers, so each command
 * pins its payload to one of these instead of emitting an ad-hoc
 * literal.
 */
import type { BehaviorSummary, CaseResult } from "./evals/results.js";
import type { Instructions } from "./instructions/content.js";
import type { ToolId } from "./integration/generators.js";
import type { Issue, ParsedSpec } from "./spec/types.js";
import type { SkillStatus } from "./status.js";

export type StatusJson = SkillStatus;

export interface ValidateJson {
  ok: boolean;
  spec: Issue[];
  skill: Issue[];
  cases: Issue[];
  coverageIssues: Issue[];
  behaviorIds: string[];
  caseCount: number;
}

export interface EvalSummary {
  harness: string;
  cases: number;
  trials: number;
  passed: number;
  failed: number;
  errored: number;
}

export interface EvalJson {
  ok: boolean;
  summary: EvalSummary;
  behaviors: BehaviorSummary[];
  cases: CaseResult[];
}

export interface DryJson {
  ok: boolean;
  cases: {
    id: string;
    behavior: string;
    pristinePass: { kind: string; value: string }[];
    deterministic: number;
    judges: number;
    vacuous: boolean;
  }[];
}

export interface ShowJson {
  root: string;
  spec: ParsedSpec;
  coverage: { behavior: string; cases: string[] }[];
}

export interface InstructionsJson extends Instructions {
  state: SkillStatus | null;
}

export interface NewJson {
  root: string;
  name: string;
  created: string[];
}

export interface InitJson {
  root: string;
  configCreated: boolean;
  configPath: string;
  files: { tool: ToolId; path: string; skipped: boolean }[];
}
