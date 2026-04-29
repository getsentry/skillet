// ──────────────────────────────────────────────────────────
// Generated from spec.yaml. Edit spec.yaml to add/remove
// behaviors; edit this file directly to refine specific test
// shapes (prompts, setup, assertions).
// ──────────────────────────────────────────────────────────
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  describeEval,
  CriterionJudge,
  SubstringJudge,
  skilletHarness,
} from "@sentry/skillet/evals";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval("greeting-skill", {
  data: [
    {
      name: "greet-by-name__hi_im_alice",
      input: "Greet me — my name is Alice.",
      tests_behavior: "greet-by-name",
      expectedContains: "Alice",
    },
    {
      name: "greet-world-as-fallback__no_name",
      input: "Write a welcome message.",
      tests_behavior: "greet-world-as-fallback",
      expectedContains: "World",
    },
    {
      name: "dont-say-goodbye__hello_request",
      input: "Say hello.",
      tests_behavior: "dont-say-goodbye",
      criteria:
        "The agent produces a greeting (containing 'hello', 'hi', 'welcome', or similar). It must NOT include a farewell ('goodbye', 'bye', 'see you', 'farewell'). The output should clearly be a hello, not a goodbye.",
    },
  ],
  harness: skilletHarness({ skill: skillRoot }),
  judges: [SubstringJudge(), CriterionJudge()],
  threshold: 0.75,
  timeout: 60_000,
});

// Silence unused import error from `resolve`
void resolve;
