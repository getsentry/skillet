// ──────────────────────────────────────────────────────────
// Generated from spec.yaml. Behaviors and triggers come from the
// spec; eval prompts/setup/assertions live here. Edit spec.yaml
// to add/remove behaviors. Edit this file directly to refine
// specific test shapes.
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

describeEval("skillet", {
  data: [
    // ── Behavior cases ────────────────────────────────────────
    {
      name: "choose-create-for-new-skills__new_python_skill",
      tests_behavior: "choose-create-for-new-skills",
      input: "I need a skill for reviewing Python imports. What skillet command should I use?",
      criteria:
        "The agent must recommend `skillet create` (via `npx @sentry/skillet create`) as the primary command for new skills. Both `create` and the `@sentry/skillet` package name should appear in the recommendation.",
    },
    {
      name: "choose-improve-for-existing-skills__existing_skill_path",
      tests_behavior: "choose-improve-for-existing-skills",
      input: "I already have a SKILL.md at ./my-review-skill but it needs work. What command?",
      criteria:
        "The primary recommendation must be `skillet improve`. The agent may mention that improve auto-imports legacy skills (no separate `spec import` step), but `improve` must be the clear first recommendation.",
    },
    {
      name: "choose-spec-show-for-inspection__view_spec",
      tests_behavior: "choose-spec-show-for-inspection",
      input:
        "I want to see what's in the spec.yaml of my skill at ./my-skill without making any changes. What command?",
      expectedContains: "spec show",
    },
    {
      name: "choose-spec-refine-for-feedback__nl_change",
      tests_behavior: "choose-spec-refine-for-feedback",
      input:
        "My skill at ./reviewer almost works but I want it to also flag list comprehensions, not just for-loops. How do I update it?",
      expectedContains: "spec refine",
    },
    {
      name: "choose-add-eval-for-named-behaviors__named_behaviors",
      tests_behavior: "choose-add-eval-for-named-behaviors",
      input:
        "I want to add eval cases to my skill that test whether it handles empty input and rejects binary files. How?",
      expectedContains: "add-eval",
    },
    {
      name: "choose-verify-for-checking__check_skill",
      tests_behavior: "choose-verify-for-checking",
      input:
        "I just edited my skill and want to check that everything's consistent before running the evals. What should I do?",
      criteria:
        "The agent must recommend `skillet verify`. Recommending `skillet validate` is a failure — that command was removed.",
    },
    {
      name: "scope-package-name__create_command",
      tests_behavior: "scope-package-name",
      input: "Show me the command to create a skill for Django query optimization.",
      criteria:
        "The agent must use the scoped package name `@sentry/skillet` (e.g. `npx @sentry/skillet create ...`). Recommending `npx skillet ...` (unscoped) is a failure.",
    },
    {
      name: "capture-intent-before-generation__no_evals_yet",
      tests_behavior: "capture-intent-before-generation",
      input:
        "I have a commit message skill at ./commit-skill that's been working well but has no evals. Can you help me add some?",
      criteria:
        "The agent's response must ask the user questions to capture intent BEFORE running any skillet command. Look for questions about the most important behaviors, examples of good/bad output, edge cases, common mistakes, or trigger phrases. The agent may briefly describe the eventual `skillet add-eval` step, but the primary action in this response must be asking questions, not running commands.",
    },
    {
      name: "explain-spec-as-source-of-truth__handedit_question",
      tests_behavior: "explain-spec-as-source-of-truth",
      input: "Can I just edit the SKILL.md directly to change the wording of one of the rules?",
      criteria:
        "The agent should explain that SKILL.md is derived from spec.yaml and that hand edits will be overwritten on the next regen. The agent should direct the user to use `skillet spec refine` (or another spec subcommand) to make the change instead.",
    },

    // ── Must-not cases ────────────────────────────────────────
    {
      name: "dont-mention-api-keys__setup_question",
      tests_behavior: "dont-mention-api-keys",
      input: "I want to use skillet to create a new skill. What do I need to set up first?",
      criteria:
        "The agent must NOT tell the user to set any API keys or environment variables (e.g. ANTHROPIC_API_KEY, OPENAI_API_KEY). It should explain that credentials are auto-discovered or simply tell the user to run the create command directly. Even mentioning the env var names by name is incorrect.",
    },
    {
      name: "dont-recommend-validate__pre_eval_check",
      tests_behavior: "dont-recommend-validate",
      input:
        "I just wrote a new skill and want to do a quick structural check before running evals. Walk me through the steps.",
      criteria:
        "The agent must recommend `skillet verify` for the structural check, not `skillet validate`. The validate command was removed and recommending it would error out for the user. If the agent says `validate` anywhere as a literal command (e.g. `skillet validate`), that's a fail.",
    },
    {
      name: "dont-tell-user-to-handedit-derived-files__edit_request",
      tests_behavior: "dont-tell-user-to-handedit-derived-files",
      input:
        "There's a typo in one of the eval cases at ./my-skill/evals/basic.eval.ts. Should I just open the file and fix it?",
      criteria:
        "The agent should explain that eval files are generated from spec.yaml and direct the user to update the spec (via `skillet spec refine` or by editing the behavior the case tests) for behavioral changes. Editing the .eval.ts file directly is acceptable for refining specific test shapes (prompts, assertions) but not for changing what behaviors are tested. The agent should NOT tell the user that .eval.ts files are completely off-limits — only that behavior-level changes go through the spec.",
    },
  ],
  harness: skilletHarness({ skill: skillRoot }),
  judges: [SubstringJudge(), CriterionJudge()],
  threshold: 0.75,
  timeout: 60_000,
});
