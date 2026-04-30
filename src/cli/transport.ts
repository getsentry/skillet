import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import { renderSpec, type SkillSpec } from "../spec/index.js";
import type { InteractiveTransport, TurnPresentation } from "../authoring/phases/spec-author.js";

/**
 * Thrown by the non-TTY transport when a question would otherwise
 * block. The author loop catches and re-throws; the calling command
 * persists a session file and surfaces the questions to the user
 * (or agent harness) so the run can be resumed.
 */
export class PausedForAnswers extends Error {
  questions: string[];
  constructor(questions: string[]) {
    super(`Spec-author paused awaiting ${questions.length} user answer(s).`);
    this.name = "PausedForAnswers";
    this.questions = questions;
  }
}

export interface InteractiveSession {
  transport: InteractiveTransport;
  /** Release stdin/stdout handles so the process can exit cleanly. */
  close: () => void;
}

const isTty = (): boolean => {
  // process.stdin.isTTY is `true | undefined`, not `boolean`. Coerce
  // explicitly so the function returns `boolean` and short-circuits
  // on non-TTY (undefined) cleanly.
  const inOk: boolean = process.stdin.isTTY ?? false;
  const outOk: boolean = process.stdout.isTTY ?? false;
  return inOk && outOk;
};

const summarizeSpec = (spec: SkillSpec): string => {
  return [
    `name:        ${spec.name}`,
    `class:       ${spec.class}`,
    `behaviors:   ${spec.behaviors.length}`,
    `must_not:    ${spec.must_not.length}`,
    `references:  ${(spec.references ?? []).length}`,
  ].join("\n");
};

const presentTurn = (turn: TurnPresentation): void => {
  console.log(
    `\n── Spec-author turn ${turn.iteration} (${turn.patchCount} patch${turn.patchCount === 1 ? "" : "es"}) ──`,
  );
  console.log(summarizeSpec(turn.spec));
  if (turn.toolSummary != null) {
    console.log(`  ${turn.toolSummary}`);
  }
  if (!turn.gateOk) {
    if (turn.missingDimensions.length > 0) {
      console.log(`  ! missing dimensions: ${turn.missingDimensions.join(", ")}`);
    }
    if (turn.missingReferenceTopics.length > 0) {
      console.log(`  ! missing reference topics: ${turn.missingReferenceTopics.join(", ")}`);
    }
  } else {
    console.log("  ✓ class gates pass");
  }
};

const ask = (rl: ReadlineInterface, prompt: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
};

/**
 * Build a transport that talks to the user.
 *
 * - TTY mode: blocking readline. Pending questions are asked one at a
 *   time inline.
 * - Non-TTY mode: the very first `askQuestion` call throws
 *   `PausedForAnswers`; the calling command persists a session and
 *   exits with the questions, so the run can resume on a later
 *   invocation. Multi-question batches are surfaced together by the
 *   spec-author loop, which reads pending questions in bulk.
 *
 * `askAccept` in non-TTY mode also pauses (as if the LLM had asked
 * "do you want to commit this spec?" — the user has to confirm
 * explicitly), which keeps the agent harness loop honest about
 * acceptance never being silent.
 */
export const createInteractiveSession = (): InteractiveSession => {
  if (!isTty()) {
    return {
      transport: {
        presentTurn,
        askQuestions: (qs) => Promise.reject(new PausedForAnswers(qs)),
        askAccept: () =>
          Promise.reject(
            new PausedForAnswers([
              "The spec passes class gates. Confirm you want to commit it (answer 'yes' to accept, anything else to keep iterating).",
            ]),
          ),
      },
      close: () => {
        // No-op — non-TTY transport doesn't allocate resources.
      },
    };
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const askQuestions = async (questions: string[]): Promise<string[]> => {
    const answers: string[] = [];
    for (const q of questions) {
      console.log(`\n? ${q}`);
      const a = (await ask(rl, "> ")).trim();
      answers.push(a === "" ? "(no answer)" : a);
    }
    return answers;
  };

  const askAccept = async (spec: SkillSpec): Promise<"accept" | "iterate"> => {
    console.log("\n── Final spec ──");
    console.log(renderSpec(spec));
    console.log("\nAccept this spec? [y/N]");
    const answer = (await ask(rl, "> ")).trim().toLowerCase();
    return answer === "y" || answer === "yes" ? "accept" : "iterate";
  };

  return {
    transport: {
      presentTurn,
      askQuestions,
      askAccept,
    },
    close: () => {
      rl.close();
    },
  };
};
