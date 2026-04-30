import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveModels } from "../agent/provider.js";
import { SpecAuthorPaused, runSpecAuthor } from "../authoring/phases/spec-author.js";
import { buildAuthoringScope } from "../authoring/scope.js";
import { deleteSession, readSession, sessionExists } from "../authoring/session.js";
import { handleSpecAuthorPause } from "../cli/pause.js";
import { withElapsed } from "../cli/progress.js";
import { createInteractiveSession } from "../cli/transport.js";
import { regenerate, specFileName, writeSpec } from "../spec/index.js";
import { withStaging } from "../staging/index.js";
import { printCoverageReport } from "./coverage-report.js";

const errorMessage = (err: unknown): string => {
  return err instanceof Error ? err.message : String(err);
};

interface ResumeOptions {
  path: string;
  answers: string[];
}

const parseResumeArgs = (args: string[]): ResumeOptions | null => {
  const answers: string[] = [];
  let path: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? "";
    if (a === "--answer") {
      const next = args[i + 1];
      if (next == null) return null;
      answers.push(next);
      i += 1;
      continue;
    }
    if (a.startsWith("--answer=")) {
      answers.push(a.slice("--answer=".length));
      continue;
    }
    if (a.startsWith("--")) {
      // Unknown flag — skip.
      continue;
    }
    path ??= a;
  }
  if (path == null) return null;
  return { path, answers };
};

/**
 * `skillet resume <path> --answer "..." [--answer "..."]`
 *
 * Pick up a paused spec-author session. The number of `--answer`
 * flags must match the session's pending question count; the resume
 * command pre-feeds them to the author loop and continues from the
 * point of the pause. On success the session file is deleted and
 * SKILL.md / evals are regenerated; if the loop pauses again, the
 * session file is rewritten with the new pending questions.
 */
export const resumeCommand = async (args: string[]): Promise<number> => {
  const opts = parseResumeArgs(args);
  if (opts == null) {
    console.error('Usage: skillet resume <path> --answer "..." [--answer "..."]');
    return 1;
  }
  const skillRoot = resolve(opts.path);
  if (!sessionExists(skillRoot)) {
    console.error(`Error: no spec-author session found at ${skillRoot}.`);
    console.error("Run `skillet create` or `skillet spec init` to start a new one.");
    return 1;
  }

  const session = readSession(skillRoot);
  if (session == null) {
    // Defensive — sessionExists returned true above.
    console.error(`Error: failed to read session at ${skillRoot}.`);
    return 1;
  }

  if (opts.answers.length !== session.pendingQuestions.length) {
    console.error(
      `Error: session has ${session.pendingQuestions.length} pending question(s), but ${opts.answers.length} --answer flag(s) were provided.`,
    );
    console.error("Pending questions:");
    for (const [i, q] of session.pendingQuestions.entries()) {
      console.error(`  Q${i + 1}: ${q}`);
    }
    return 1;
  }

  const pendingAnswers = session.pendingQuestions.map((q, i) => ({
    question: q,
    answer: opts.answers[i] ?? "(no answer)",
  }));

  const models = resolveModels();
  const interactive = createInteractiveSession();
  const scope = buildAuthoringScope({
    skillRoot,
    ...(session.inputPaths != null && session.inputPaths.length > 0
      ? { inputPaths: session.inputPaths }
      : {}),
  });

  let finalSpec;
  try {
    const result = await runSpecAuthor({
      model: models.agent,
      baseline: session.spec,
      scope,
      transport: interactive.transport,
      resume: {
        messages: session.messages,
        pendingAnswers,
        pauseKind: session.pauseKind,
      },
    });
    if (!result.accepted) {
      console.error(
        `spec-author loop ended without user acceptance after ${result.turns} turn(s).`,
      );
      return 1;
    }
    finalSpec = result.spec;
  } catch (err: unknown) {
    if (err instanceof SpecAuthorPaused) {
      const pauseInput: Parameters<typeof handleSpecAuthorPause>[0] = {
        err,
        skillRoot,
        seedKind: session.seedKind,
      };
      if (session.seedInput != null) pauseInput.seedInput = session.seedInput;
      if (session.allowedTools != null) pauseInput.allowedTools = session.allowedTools;
      return handleSpecAuthorPause(pauseInput);
    }
    console.error(`Error: ${errorMessage(err)}`);
    return 1;
  } finally {
    interactive.close();
  }

  if (session.allowedTools != null) {
    finalSpec.frontmatter_extras = {
      ...finalSpec.frontmatter_extras,
      "allowed-tools": session.allowedTools,
    };
  }

  // Spec accepted — clear the session, then commit the spec and
  // regenerate derived files in a staged write.
  mkdirSync(skillRoot, { recursive: true });
  const specPath = join(skillRoot, specFileName());
  const alreadyHadSpec = existsSync(specPath);
  try {
    await withStaging(skillRoot, async (stagingDir) => {
      writeSpec(join(stagingDir, specFileName()), finalSpec);
      console.log(`✓ Staged ${specFileName()}`);
      console.log("Regenerating SKILL.md and evals...");
      await regenerate(stagingDir, {
        model: models.agent,
        evalGenModel: models.evalGen,
        onProgress: withElapsed((msg) => {
          console.log(`  ${msg}`);
        }),
      });
    });
  } catch (err: unknown) {
    console.error(`Error during regeneration: ${errorMessage(err)}`);
    if (alreadyHadSpec) {
      console.error("Original spec is unchanged.");
    }
    return 1;
  }

  deleteSession(skillRoot);
  console.log(`\nSpec accepted; session cleared.`);
  printCoverageReport(skillRoot);
  return 0;
};
