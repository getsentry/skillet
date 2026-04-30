import type { SpecAuthorPaused } from "../authoring/phases/spec-author.js";
import { writeSession, type SeedKind, type SpecAuthorSession } from "../authoring/session.js";

export interface PauseHandlerInput {
  err: SpecAuthorPaused;
  skillRoot: string;
  seedKind: SeedKind;
  seedInput?: string;
  allowedTools?: string;
  inputPaths?: string[];
}

/**
 * Persist a paused spec-author session and print the open questions to
 * stderr so the caller (human or agent harness) can re-invoke
 * `skillet resume <path> --answer "..."` with answers in order.
 *
 * Returns the suggested process exit code (`2` — distinct from `1`
 * which we use for hard errors).
 */
export const handleSpecAuthorPause = (input: PauseHandlerInput): number => {
  const session: SpecAuthorSession = {
    version: 1,
    skillRoot: input.skillRoot,
    seedKind: input.seedKind,
    spec: input.err.spec,
    messages: input.err.messages,
    pendingQuestions: input.err.questions,
    pauseKind: input.err.pauseKind,
  };
  if (input.seedInput != null) session.seedInput = input.seedInput;
  if (input.allowedTools != null) session.allowedTools = input.allowedTools;
  if (input.inputPaths != null && input.inputPaths.length > 0) {
    session.inputPaths = input.inputPaths;
  }
  writeSession(session);

  console.error("\nSpec-author paused — answers needed before continuing.");
  console.error(`Session saved to ${input.skillRoot}/.skillet-session.json`);
  console.error("");
  for (const [i, q] of input.err.questions.entries()) {
    console.error(`  Q${i + 1}: ${q}`);
  }
  console.error("");
  console.error(`Resume with:`);
  console.error(
    `  skillet resume ${input.skillRoot} ${input.err.questions.map(() => '--answer "..."').join(" ")}`,
  );
  return 2;
};
