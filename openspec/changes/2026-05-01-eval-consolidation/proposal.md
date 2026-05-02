# Eval Consolidation — Shared Judges, Disk-Backed Fixtures, No Duplication

## Why

The current eval-gen output, per behavior, is independently
correct but the set across a skill is heavily duplicative and
unreadable in two specific ways:

1. **Inline shell heredocs in `harness.setup(...)`.** Every case
   embeds a multi-line YAML/Python/Bash fixture as one escaped
   string with `\n` separators. Brutal to read, brutal to edit by
   hand, brutal to diff. 29 of 29 generated wrdn-gha-workflows
   files do this.
2. **Per-file judge declarations duplicated across files.** 29
   files declare 98 judges. "Identifies the privileged trigger",
   "Rates HIGH severity", "Ties to PR-controlled code" reappear
   across `report-pwn-request`, `report-comment-chatops`,
   `state-entry-point`, etc. with slight name/wording variation
   each time. The reader can't tell at a glance which judges are
   the same concept across the suite.

The fix is structural: stop generating eval files in isolation,
stop embedding fixtures inline, stop redeclaring shared judges.
Add a cross-behavior **consolidation** stage between per-entry
generation and final rendering.

## Per-skill output, after this change

```
skills/<skill>/
  evals/
    _judges.ts                    ← generated; one canonical set per skill
    fixtures/
      <case-slug-1>/
        .github/workflows/ci.yml  ← real readable fixture file
        scripts/setup.sh
      <case-slug-2>/
        ...
    <behavior-id-1>.eval.ts       ← imports from _judges.ts; uses harness.useFixture(slug)
    <behavior-id-2>.eval.ts
    ...
```

Each `.eval.ts` shrinks dramatically:

```ts
import { expect } from "vitest";
import { describeEval, skilletHarness, useFixture } from "@sentry/skillet/evals";
import {
  IdentifiesPrivilegedTriggerJudge,
  IdentifiesPRControlledCheckoutJudge,
  ConnectsSecretsOrWriteTokenJudge,
  RatesHighOrCriticalSeverityJudge,
} from "./_judges.js";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval(
  "report-pwn-request",
  { harness: skilletHarness({ skill: skillRoot }) },
  (it) => {
    it("report-pwn-request__pr-target-checkout", { timeout: 120_000 }, async ({ run, behavior, harness }) => {
      behavior("report-pwn-request");
      await harness.useFixture("report-pwn-request__pr-target-checkout");
      const result = await run("Audit .github/workflows/ci.yml for security issues.");

      await expect(result).toSatisfyJudge(IdentifiesPrivilegedTriggerJudge);
      await expect(result).toSatisfyJudge(IdentifiesPRControlledCheckoutJudge);
      await expect(result).toSatisfyJudge(ConnectsSecretsOrWriteTokenJudge);
      await expect(result).toSatisfyJudge(RatesHighOrCriticalSeverityJudge);
    });
  },
);
```

No inline heredoc, no inline judge declarations. Reads as
normal vitest.

## What Changes

- **NEW** Per-skill `evals/_judges.ts` — generated, contains the
  canonical deduped set of named judges across all behaviors in
  the skill. Marked as a generated artifact in its banner; users
  edit it through behaviors, not directly.
- **NEW** Per-case fixture trees on disk under
  `evals/fixtures/<case-slug>/`. The case's `setup` becomes a
  declarative file map; skillet writes the tree at gen time. The
  generated `.eval.ts` calls `harness.useFixture(<case-slug>)`.
- **NEW** Harness method `useFixture(slug)` that copies the named
  fixture tree from `<skill-root>/evals/fixtures/<slug>/` into
  the per-test workspace, then proceeds normally. Replaces the
  inline-shell `setup(script)` call as the primary path.
- **MODIFIED** `CasePlan.setup` becomes `CasePlan.fixture: Record<string, string>` —
  a map from relative workspace path to file content. Skillet
  writes those files into `evals/fixtures/<case-name>/` and
  references them via `useFixture` in the rendered eval. The
  legacy `setup: string` field stays accepted for backward compat
  but generated plans use `fixture` going forward.
- **NEW** Cross-behavior **consolidation** stage in
  `runEvalGen` that runs ONCE after all per-entry plans complete:
  1. Dedupe judges by exact name match across plans; surface a
     warning when two judges share a name but have different
     criteria (we keep the first criterion, log the conflict).
  2. Write `evals/_judges.ts` with the canonical set.
  3. Write each fixture tree under `evals/fixtures/<case-slug>/`.
  4. Render each `.eval.ts` importing judges from `./_judges.js`
     and calling `harness.useFixture(<case-slug>)` instead of
     inline `setup`.
- **MODIFIED** Generator prompt teaches the new shape — emit
  `fixture` (file map), reference judges by name knowing they'll
  be deduped across the suite. The prompt notes that judges
  should follow stable naming conventions
  (`IdentifiesPrivilegedTriggerJudge`,
  `RatesHighOrCriticalSeverityJudge`) so cross-file dedup
  catches them.
- **MODIFIED** Verifier prompt teaches the consolidation
  awareness — judges declared in this plan may be reused
  cross-suite; if a similar judge already exists in another
  generated plan, prefer its name.

## Non-Goals

- **Cross-skill shared judges.** Each skill gets its own
  `_judges.ts`. Skills don't share judge declarations across
  package boundaries.
- **LLM-driven dedup.** Dedup is exact-name match. Fuzzy /
  semantic dedup is deferred — exact match catches most
  duplication if the prompt enforces stable names.
- **Reformatting existing on-disk eval files.** Files generated
  before this change still load and run. New generation produces
  the new shape; old files keep working until regenerated.
- **Helper extraction (`_helpers.ts`) for common runs.** The
  prompts ("audit .github/workflows/X.yml") are intentionally
  varied per-case for realism. We don't factor them out.

## Capabilities Touched

- `eval-format` — new file layout (`_judges.ts`, `fixtures/`),
  `useFixture` harness method.
- `skill-authoring` — eval-gen consolidation stage, prompt
  updates for fixture map + judge naming convention.
