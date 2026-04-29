## Context

Skillet has a custom YAML-based eval format (`evals/*.eval.yaml`) with a custom runner that discovers YAML files, parses them, creates temp workspaces, runs an agent loop, executes structural checks, and optionally calls an LLM judge. The types in `src/eval/types.ts` were already shaped toward vitest-evals compatibility (matching `NormalizedSession`, `HarnessRun`, `UsageSummary`), but the actual execution path is fully custom.

Meanwhile, `spec.yaml` carries `BehaviorEval` blocks (`setup`, `prompt`, `expect`, `criteria`) per behavior. This means the spec — which should be a user-readable intent document — doubles as an eval generation template. The `promotePassingEvals` module (`src/spec/promote.ts`) freezes passing LLM-invented cases back into the spec's eval blocks, further coupling spec to eval implementation.

vitest-evals (getsentry/vitest-evals#41) is about to land. It provides `describeEval`, typed harnesses (`piAiHarness`, `aiSdkHarness`), judges (`ToolCallJudge`, `StructuredOutputJudge`), a `toSatisfyJudge` matcher, and a reporter — all built on vitest. Skills in getsentry/skills are already being converted to this format (skills#134).

The codebase is pre-1.0 (v0.15). Breaking changes are acceptable.

## Goals / Non-Goals

**Goals:**
- Eval files become `evals/*.eval.ts` that vitest-evals runs natively. Skillet generates TypeScript, not YAML. When vitest-evals lands, skills just work without an adapter layer.
- `spec.yaml` drops `BehaviorEval` and the `eval` field on behaviors/must_nots. Behaviors are `{id, statement, rationale?}` — simple strings a human reads and edits. The spec is the what; the eval file is the how.
- `skillet eval` delegates to vitest. The custom runner, parser, workspace manager, checks engine, and judge caller are removed. Vitest-evals' harness, judges, and reporter handle all of that.
- The verify layers (coverage, results) still work — they extract `tests_behavior` metadata from the TypeScript eval files so that spec → eval → result mapping remains intact.
- The improve loop's eval-run step calls vitest instead of the custom runner and parses vitest-evals output into skillet's `EvalRunResult` shape.

**Non-Goals:**
- Keeping the YAML eval format as a fallback. Clean break.
- Building a custom vitest-evals harness package (like `@vitest-evals/harness-pi-ai`). Skillet's harness is inline in the generated eval files — it wraps `runAgent` from `src/agent/loop.ts` into a `piAiHarness`-compatible shape. If vitest-evals ships a generic harness that works, we use it; otherwise the generated eval file contains the adapter code directly.
- Migrating existing skills in getsentry/skills. Skillet generates new evals in the new format; existing skills can re-run `skillet improve` to get TypeScript evals.
- Multi-file eval generation (one file per behavior). Start with one `evals/basic.eval.ts` containing one `describeEval` block with all cases, matching the current single-file pattern. Split later if needed.

## Decisions

### 1. Generated eval file uses `describeEval` with inline harness

**Decision**: The eval-gen phase produces a single `evals/basic.eval.ts` file. Each behavior/must_not maps to one case in the `data` array. The harness is an inline adapter that wraps skillet's `runAgent` into the vitest-evals `HarnessRun` shape.

```typescript
import { describeEval } from "vitest-evals";
import { skilletHarness } from "@sentry/skillet/harness";

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
      criteria: "The agent produces a greeting, NOT a farewell.",
    },
  ],
  harness: skilletHarness({ skill: "./path/to/skill" }),
  test: async ({ run, caseData, judge }) => {
    if (caseData.expectedContains) {
      expect(run.output).toContain(caseData.expectedContains);
    }
    if (caseData.criteria) {
      await judge(SkilletJudge(), { criteria: caseData.criteria });
    }
  },
});
```

**Rationale**: Keeps the generated file self-contained and readable. The `data` array is the only thing the LLM needs to produce — the boilerplate (imports, harness, test function) is templated. `tests_behavior` in the data object preserves the spec→eval linkage for verify.

**Alternatives considered**:
- Separate file per behavior: more files to manage, harder for the LLM to generate correctly, and verify would need to glob more. Defer until there's a scaling reason.
- Using vitest-evals' `piAiHarness` directly: requires skillet's agent loop to expose a pi-ai–compatible interface. Possible but couples skillet to pi-ai internals. A thin `skilletHarness` adapter is more stable.

### 2. `skilletHarness` ships as a package export

**Decision**: Skillet exports `@sentry/skillet/harness` — a vitest-evals–compatible `Harness` that wraps `runAgent`. It creates a temp workspace, loads the skill, runs the agent, and returns `HarnessRun`. The generated eval files import from it.

**Rationale**: Keeps the generated TypeScript clean (one import, not 20 lines of adapter code inline). The harness is test infrastructure, not generated content — it changes rarely and shouldn't be re-generated by the LLM.

**Alternatives considered**:
- Inline the entire adapter in each generated file: makes files self-contained but bloated and fragile (LLM has to reproduce the adapter correctly each time).
- Contribute a harness to vitest-evals: wrong layer — skillet's agent execution is skillet-specific.

### 3. Spec drops `BehaviorEval` entirely

**Decision**: Remove `BehaviorEval` type, `eval` field from `Behavior` and `MustNot`, and the `update_eval` patch op from `SpecPatch`. The parser silently ignores any `eval` key in existing specs (backward-compatible read, not a parse error). The `promote.ts` module is removed.

**Rationale**: The spec should be the user's intent document — "what the skill does" not "how to test it." Eval details are an implementation concern of the generated test file. Promotion was a workaround for non-deterministic eval generation; with TypeScript eval files that the LLM generates once and the improve loop tunes, the problem it solved doesn't exist.

**Alternatives considered**:
- Keep `eval` as an optional hint (setup script, prompt suggestion): adds complexity for marginal value. The eval-gen LLM can derive good prompts from the behavior statement alone.

### 4. Verify coverage reads metadata from TypeScript AST or comment convention

**Decision**: Coverage verification (`src/verify/coverage.ts`) extracts `tests_behavior` from eval TypeScript files using a regex scan of the `data` array for `tests_behavior: "<id>"` string literals. No full TypeScript AST parser — the generated format is controlled by skillet so the pattern is predictable.

**Rationale**: Adding a TypeScript parser (ts-morph, @typescript-eslint/parser) is heavy for extracting a string literal from a known template. Regex on a controlled format is fast and dependency-free. If the format evolves to be more complex, upgrade to AST parsing then.

**Alternatives considered**:
- Full TypeScript AST parsing: correct but heavyweight. Overkill for a string literal in a known template.
- Comment annotation (`// @tests_behavior: greet-by-name`): works but splits the metadata from the data object, making the file harder to read and the LLM more likely to omit it.
- Run the eval file in a discovery-only mode to extract metadata: requires Node import, which may fail if dependencies aren't installed. Too fragile for a verification step.

### 5. `skillet eval` delegates to vitest

**Decision**: `skillet eval [path]` spawns `vitest run` with a config that points at the skill's `evals/` directory. Skillet provides a `vitest.config.ts` template (or generates one in the skill directory) that loads the reporter and configures the harness. Result parsing reads vitest's JSON reporter output and maps it into `EvalRunResult`.

**Rationale**: vitest is the test runner. Skillet shouldn't reimplement test execution, parallelism, timeouts, or reporting when vitest already handles all of it.

**Alternatives considered**:
- Programmatic vitest API (`startVitest`): cleaner than spawning a subprocess but requires vitest as a library dependency. Start with subprocess; switch to programmatic if the JSON parsing becomes brittle.

### 6. Improve loop adapts to vitest results

**Decision**: The improve loop's eval step (`authorSkill` in `src/authoring/loop.ts`) calls vitest via `skillet eval --json`, parses the JSON output into `EvalRunResult`, and feeds it to `verifyResults` exactly as before. The loop's structure doesn't change — only the eval execution backend.

**Rationale**: The loop's value is in the verify→tune→repeat cycle, not in how evals execute. Swapping the runner is a plumbing change.

### 7. Module layout changes

```
src/
  eval/
    index.ts          # re-exports; slimmed to types + discovery
    types.ts          # KEPT: EvalRunResult, EvalCaseResult (unchanged shape)
    discovery.ts      # NEW: glob evals/*.eval.ts, extract tests_behavior via regex
    vitest-runner.ts  # NEW: spawn vitest, parse JSON output → EvalRunResult
    parser.ts         # REMOVED (YAML parser)
    runner.ts         # REMOVED (custom runner)
    checks.ts         # REMOVED (structural checks — vitest handles assertions)
    judge.ts          # REMOVED (LLM judge — vitest-evals judges replace it)
    workspace.ts      # MOVED to harness (workspace creation is harness concern)
    requirements.ts   # MOVED to harness (skipIf logic in describeEval)
  harness/
    index.ts          # skilletHarness(): Harness adapter wrapping runAgent
    workspace.ts      # temp workspace creation (from eval/workspace.ts)
  spec/
    types.ts          # BehaviorEval REMOVED; Behavior.eval REMOVED; update_eval patch REMOVED
    parser.ts         # eval block parsing removed; ignores unknown `eval` key
    patcher.ts        # update_eval op removed
    promote.ts        # REMOVED entirely
    ...               # rest unchanged
  verify/
    coverage.ts       # reads .eval.ts instead of .eval.yaml
    results.ts        # unchanged (consumes EvalRunResult)
    ...
  authoring/
    phases/eval-gen.ts    # produces TypeScript, not YAML
    prompts/eval-gen.ts   # prompt rewritten for TypeScript output
    loop.ts               # calls vitest runner instead of custom runner; promote removed
  commands/
    eval.ts           # delegates to vitest
```

## Risks / Trade-offs

- **[vitest-evals not yet landed]** → We're building against a PR. If the API changes before merge, the generated eval files break. Mitigated by: the core `describeEval` + `Harness` + `HarnessRun` shape is stable in the PR; minor API changes are easy to fix in the template.

- **[Regex-based metadata extraction is fragile]** → If someone hand-edits eval files in unexpected ways, coverage verify may miss `tests_behavior` entries. Mitigated by: skillet generates the files in a known template; the regex is tested against that template. Hand-edited files are explicitly not guaranteed to be coverage-verified.

- **[vitest as a runtime dependency]** → Skillet now requires vitest (and vitest-evals) to run evals. This is heavier than the current zero-dep YAML runner. Mitigated by: vitest is a dev dependency, not a production one. Skills that use skillet for authoring already have a Node.js environment.

- **[Eval-gen LLM produces invalid TypeScript]** → The LLM generates a `data` array, not a full file — the template wraps it. But the LLM could still produce malformed strings or invalid JS. Mitigated by: the generated file is type-checked by `tsc` before running; vitest fails fast on syntax errors. The improve loop can retry.

- **[Promote removal means non-deterministic regens]** → Without freezing passing cases into the spec, re-running `improve` may produce different eval cases each time. Mitigated by: the generated `.eval.ts` file IS the frozen artifact — it's committed to git. The spec doesn't need to carry eval details because the eval file itself is durable.
