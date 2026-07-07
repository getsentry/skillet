import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { runHarness } from "./run.js";
import type { ResolvedHarness } from "./types.js";

export interface JudgeVerdict {
  status: "pass" | "fail" | "error";
  reasoning: string;
}

export const JUDGE_TIMEOUT_SECONDS = 120;

const MAX_FILE_BYTES = 4_000;
const MAX_TOTAL_BYTES = 32_000;
const SKIPPED_DIRS = new Set([".git", "node_modules", ".claude", ".skillet"]);

/**
 * Bounded dump of the workspace for the grading prompt: file tree plus
 * small text file contents. The judge runs isolated from the workspace
 * (judge spec), so everything it grades must be in the prompt.
 */
export const describeWorkspace = (workspace: string): string => {
  const sections: string[] = [];
  let budget = MAX_TOTAL_BYTES;

  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir).toSorted();
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIPPED_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      const rel = relative(workspace, full);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(full);
        continue;
      }
      if (budget <= 0) {
        sections.push(`(${rel} omitted — size budget exhausted)`);
        continue;
      }
      let content: string;
      try {
        content = readFileSync(full, "utf-8");
      } catch {
        sections.push(`--- ${rel} (unreadable, ${stat.size} bytes) ---`);
        continue;
      }
      if (content.includes("\u0000")) {
        sections.push(`--- ${rel} (binary, ${stat.size} bytes) ---`);
        continue;
      }
      const truncated = content.length > MAX_FILE_BYTES;
      const shown = truncated ? content.slice(0, MAX_FILE_BYTES) : content;
      budget -= shown.length;
      sections.push(`--- ${rel} ---\n${shown}${truncated ? "\n(truncated)" : ""}`);
    }
  };
  walk(workspace);
  return sections.length > 0 ? sections.join("\n") : "(workspace is empty)";
};

export const buildJudgePrompt = (
  criterion: string,
  casePrompt: string,
  transcript: string,
  workspaceDump: string,
): string => `You are grading the output of a coding agent against one criterion. Do not fix anything; only grade.

## Criterion

${criterion}

## Task the agent was given

${casePrompt}

## Agent transcript

${transcript.slice(0, 30_000)}

## Workspace state after the run

${workspaceDump}

## Your verdict

Judge strictly: the criterion must actually be satisfied by the workspace state or transcript above, not merely attempted or claimed. Explain your reasoning in one short paragraph, then end your reply with a final line that is exactly "VERDICT: pass" or "VERDICT: fail".`;

export const parseVerdict = (text: string): "pass" | "fail" | null => {
  const matches = [...text.matchAll(/VERDICT:\s*(pass|fail)/gi)];
  const last = matches.at(-1)?.[1]?.toLowerCase();
  return last === "pass" || last === "fail" ? last : null;
};

/**
 * Grade one judge check through the harness (judge spec,
 * "Harness-executed judge"): spawn the agent CLI with the grading
 * prompt in a directory isolated from the eval workspace, parse the
 * VERDICT line, retry once, and report `error` (never a silent fail)
 * when the output stays unparseable.
 */
export const runJudge = async (
  harness: ResolvedHarness,
  criterion: string,
  casePrompt: string,
  transcript: string,
  workspace: string,
): Promise<JudgeVerdict> => {
  const prompt = buildJudgePrompt(criterion, casePrompt, transcript, describeWorkspace(workspace));

  let lastOutput = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const judgeDir = mkdtempSync(join(tmpdir(), "skillet-judge-"));
    try {
      const run = await runHarness(harness, judgeDir, prompt, JUDGE_TIMEOUT_SECONDS);
      lastOutput = run.lastMessage !== "" ? run.lastMessage : run.transcript;
      const verdict = parseVerdict(lastOutput);
      if (verdict != null) {
        return { status: verdict, reasoning: lastOutput.slice(0, 2_000) };
      }
    } catch (err) {
      lastOutput = err instanceof Error ? err.message : String(err);
    } finally {
      rmSync(judgeDir, { recursive: true, force: true });
    }
  }
  return {
    status: "error",
    reasoning: `judge output had no VERDICT line after retry: ${lastOutput.slice(0, 1_000)}`,
  };
};
