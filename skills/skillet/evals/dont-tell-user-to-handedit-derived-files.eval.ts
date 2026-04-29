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

describeEval("dont-tell-user-to-handedit-derived-files", {
  data: [
  {
    name: "dont-tell-user-to-handedit-derived-files__edit_request",
    tests_behavior: "dont-tell-user-to-handedit-derived-files",
    input: "There's a typo in one of the eval cases at ./my-skill/evals/basic.eval.ts. Should I just open the file and fix it?",
    criteria: "The agent should explain that eval files are generated from spec.yaml and direct the user to update the spec (via `skillet spec refine` or by editing the behavior the case tests) for behavioral changes. Editing the .eval.ts file directly is acceptable for refining specific test shapes (prompts, assertions) but not for changing what behaviors are tested. The agent should NOT tell the user that .eval.ts files are completely off-limits — only that behavior-level changes go through the spec.",
  },
  ],
  harness: skilletHarness({ skill: skillRoot }),
  judges: [SubstringJudge(), CriterionJudge()],
  threshold: 0.75,
  timeout: 60_000,
});
