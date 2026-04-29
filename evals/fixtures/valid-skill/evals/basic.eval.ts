// Legacy fixture: a skill with SKILL.md and evals but no spec.yaml.
// Used to test verify's "no spec — refuse with helpful error" path.
// Discovery-only; not run as part of skillet's own self-tests.

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  describeEval,
  SubstringJudge,
  skilletHarness,
} from "@sentry/skillet/evals";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval("test-greeting", {
  data: [
    {
      name: "greets-by-name",
      input: "Greet Alice",
      expectedContains: "Alice",
    },
    {
      name: "default-greeting",
      input: "Generate a greeting",
      expectedContains: "Hello",
    },
  ],
  harness: skilletHarness({ skill: skillRoot }),
  judges: [SubstringJudge()],
});
