// Intentional orphan: tests_behavior references a non-existent ID.
// Used by verify-failure tests to confirm the coverage layer flags
// orphan cases. Discovery-only; not run.
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  describeEval,
  SubstringJudge,
  skilletHarness,
} from "@sentry/skillet/evals";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval("orphan-case", {
  data: [
    {
      name: "orphan-case__intentional",
      tests_behavior: "nonexistent-behavior",
      input: "test",
      expectedContains: "test",
    },
  ],
  harness: skilletHarness({ skill: skillRoot }),
  judges: [SubstringJudge()],
  timeout: 30_000,
});
