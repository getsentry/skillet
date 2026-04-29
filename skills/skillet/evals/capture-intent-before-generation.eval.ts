// ──────────────────────────────────────────────────────────
// Generated initially from spec.yaml; durable after that. Edit
// freely to refine prompts, setup, and assertions for this
// behavior. Add or remove behaviors via spec.yaml — skillet only
// regenerates eval files for behaviors that don't have one yet.
// ──────────────────────────────────────────────────────────
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  describeEval,
  CriterionJudge,
  SubstringJudge,
  skilletHarness,
} from "@sentry/skillet/evals";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval("capture-intent-before-generation", {
  data: [
  {
    name: "capture-intent-before-generation__no_evals_yet",
    tests_behavior: "capture-intent-before-generation",
    input: "I have a commit message skill at ./commit-skill that's been working well but has no evals. Can you help me add some?",
    criteria: "The agent's response must ask the user questions to capture intent BEFORE running any skillet command. Look for questions about the most important behaviors, examples of good/bad output, edge cases, common mistakes, or trigger phrases. The agent may briefly describe the eventual `skillet add-eval` step, but the primary action in this response must be asking questions, not running commands.",
  },
  ],
  harness: skilletHarness({ skill: skillRoot }),
  judges: [SubstringJudge(), CriterionJudge()],
  threshold: 0.75,
  timeout: 60_000,
});
