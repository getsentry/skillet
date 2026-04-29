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

describeEval("dont-say-goodbye", {
  data: [
    {
      name: "dont-say-goodbye__hello_request",
      tests_behavior: "dont-say-goodbye",
      input: "Say hello.",
      criteria:
        "The agent produces a greeting (containing 'hello', 'hi', 'welcome', or similar). It must NOT include a farewell ('goodbye', 'bye', 'see you', 'farewell'). The output should clearly be a hello, not a goodbye.",
    },
  ],
  harness: skilletHarness({ skill: skillRoot }),
  judges: [SubstringJudge(), CriterionJudge()],
  threshold: 0.75,
  timeout: 60_000,
});
