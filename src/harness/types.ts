export interface BuiltinHarness {
  kind: "codex" | "claude";
  /** Display name, recorded in eval results. */
  name: string;
  /** Executable checked for PATH presence before any case runs. */
  binary: string;
  /** Model override passed to the CLI (e.g. "sonnet", "gpt-5"). */
  model?: string;
}

interface CustomHarness {
  kind: "custom";
  name: string;
  binary: string;
  /** sh command template with {workspace} and {prompt} placeholders. */
  command: string;
  /** Where to copy the skill, e.g. "{workspace}/.agent/skills". */
  skillDir?: string;
}

export type ResolvedHarness = BuiltinHarness | CustomHarness;

export interface HarnessRun {
  transcript: string;
  /** The agent's final message — what judges parse for verdicts. */
  lastMessage: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
}
