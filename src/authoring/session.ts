/**
 * Resumable spec-author session.
 *
 * The author loop is the only stateful authoring step: when the LLM
 * raises a question in non-TTY mode, we persist the current spec +
 * full LLM conversation under the skill root, exit with the
 * questions, and the user (or agent harness) re-invokes
 * `skillet resume` with `--answer` flags to continue.
 *
 * TTY mode never writes a session file — readline handles the dialogue
 * inline and there is nothing to resume.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Message } from "@mariozechner/pi-ai";
import type { SkillSpec } from "../spec/index.js";

export const SESSION_FILE = ".skillet-session.json";
const SCHEMA_VERSION = 1;

/**
 * Tag identifying which seed strategy produced the in-progress
 * session. Resume re-enters the author loop directly — it does not
 * re-run the seed — but the tag is recorded so debug/inspection tools
 * can show provenance.
 */
export type SeedKind = "from-description" | "from-skill" | "from-improve";

export interface SpecAuthorSession {
  version: 1;
  skillRoot: string;
  seedKind: SeedKind;
  /** The seed's input (description text or SKILL.md content), kept for diagnostics. */
  seedInput?: string;
  spec: SkillSpec;
  /** Full LLM conversation up to the pause point. */
  messages: Message[];
  /** Questions raised in the most recent turn that need user answers. */
  pendingQuestions: string[];
  /** Optional allowed-tools value to thread into the final spec on accept. */
  allowedTools?: string;
  /**
   * Absolute paths supplied via `--input` at session start. Resume
   * recomposes the research scope from these (resume itself does not
   * accept `--input` — scope is fixed at session start).
   */
  inputPaths?: string[];
}

/**
 * Path to the session file for a given skill root. The directory is
 * the skill root itself — sessions are scoped per-skill, not global.
 */
export const sessionPath = (skillRoot: string): string => {
  return join(skillRoot, SESSION_FILE);
};

export const sessionExists = (skillRoot: string): boolean => {
  return existsSync(sessionPath(skillRoot));
};

export const writeSession = (session: SpecAuthorSession): void => {
  // The constructor's literal-typed `version` makes any value other
  // than `1` a type error before runtime, so a strict equality check
  // would be statically dead. We trust the type and just write.
  const path = sessionPath(session.skillRoot);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(session, null, 2), "utf-8");
};

const isSessionLike = (v: unknown): v is SpecAuthorSession => {
  if (v == null || typeof v !== "object" || Array.isArray(v)) return false;
  // Field-presence check is deliberately shallow — JSON readers in
  // resume.ts will surface deeper schema mismatches when they try to
  // use specific fields. Bumping `SCHEMA_VERSION` is the migration
  // hook for breaking changes.
  return (v as { version?: unknown }).version === SCHEMA_VERSION;
};

export const readSession = (skillRoot: string): SpecAuthorSession | null => {
  const path = sessionPath(skillRoot);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`session at ${path} is not valid JSON: ${msg}`, { cause: err });
  }
  if (!isSessionLike(parsed)) {
    throw new Error(`session at ${path} has unexpected schema; expected version ${SCHEMA_VERSION}`);
  }
  return parsed;
};

export const deleteSession = (skillRoot: string): void => {
  const path = sessionPath(skillRoot);
  if (existsSync(path)) {
    rmSync(path, { force: true });
  }
};
