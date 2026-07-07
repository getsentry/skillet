export type HarnessKind = "codex" | "claude" | "custom";

export interface ResolvedHarness {
  /** Display name, recorded in eval results. */
  name: string;
  kind: HarnessKind;
  /** Executable checked for PATH presence before any case runs. */
  binary: string;
  /** Custom harnesses only: sh command template with {workspace} and {prompt}. */
  command?: string;
  /** Custom harnesses only: where to copy the skill, e.g. "{workspace}/.agent/skills". */
  skillDir?: string;
}

export interface HarnessRun {
  transcript: string;
  /** The agent's final message — what judges parse for verdicts. */
  lastMessage: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
}
