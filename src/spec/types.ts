export interface SpecScenario {
  name: string;
  line: number;
  when: string[];
  then: string[];
}

export interface SpecBehavior {
  /** Kebab-case slug of the name — the join key eval cases reference. */
  id: string;
  name: string;
  line: number;
  /** Normative prose between the behavior heading and its first scenario. */
  text: string;
  scenarios: SpecScenario[];
}

export interface SpecConstraint {
  id: string;
  name: string;
  line: number;
  text: string;
}

export interface SpecTriggers {
  should: string[];
  shouldNot: string[];
}

export interface ParsedSpec {
  name: string;
  intent: string;
  triggers: SpecTriggers;
  behaviors: SpecBehavior[];
  constraints: SpecConstraint[];
}

export interface SpecIssue {
  severity: "error" | "warning";
  message: string;
  line?: number;
  hint?: string;
}

export interface ParseResult {
  /** Null when the document is too broken to produce a structure. */
  spec: ParsedSpec | null;
  issues: SpecIssue[];
}
