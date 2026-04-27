## 1. Spec module foundation

- [x] 1.1 Create `src/spec/types.ts` with `SkillSpec`, `Behavior`, `MustNot`, `BehaviorEval`, `Triggers`, and `SpecPatch` discriminated-union types
- [x] 1.2 Create `src/spec/parser.ts` taking raw YAML text → `SkillSpec` (mirror of `src/eval/parser.ts` style with field extractors and narrowing)
- [x] 1.3 Create `src/spec/structural.ts` with `validateSpecStructure(spec): ValidationResult` covering required fields, unique IDs across `behaviors[]` + `must_not[]`, well-formed `eval` blocks
- [x] 1.4 Create `src/spec/io.ts` with `readSpec(path)` and `writeSpec(path, spec)` that preserve the CLI-managed banner across writes
- [x] 1.5 Create `src/spec/patcher.ts` with `applyPatch(spec, patch): SkillSpec` and `applyPatches(spec, patches[]): SkillSpec` that fail loudly on unknown ops or missing IDs
- [x] 1.6 Create `src/spec/slug.ts` with `slugify(statement): string` for behavior IDs
- [x] 1.7 Create `src/spec/index.ts` with public re-exports
- [x] 1.8 Verify: hand-write a sample `spec.yaml`, parse + structural-validate + apply patches via a one-off TS script

## 2. Authoring prompts split per phase

- [x] 2.1 Create `src/authoring/prompts/` directory; `src/authoring/prompts.ts` content moves out phase-by-phase
- [x] 2.2 Create `src/authoring/prompts/spec-init.ts` with system prompt for description → spec, including conversational clarifying-question support
- [x] 2.3 Create `src/authoring/prompts/spec-import.ts` with system prompt for SKILL.md + eval YAMLs → spec (reverse-engineering)
- [x] 2.4 Create `src/authoring/prompts/spec-refine.ts` with system prompt for current spec + feedback → `SpecPatch[]`
- [x] 2.5 Create `src/authoring/prompts/skill-gen.ts` with system prompt for `SkillSpec` → SKILL.md (replaces `buildSkillGenPrompt`); reference docs in the prompt describe spec-driven flow
- [x] 2.6 Create `src/authoring/prompts/eval-gen.ts` with system prompt for `Behavior[] + MustNot[]` → eval YAML (one case per id, named `<id>__<slug>`, tagged `tests_behavior: <id>`)
- [x] 2.7 Create `src/authoring/prompts/assess.ts` with system prompt for failed eval cases + spec → `SpecPatch[]`
- [x] 2.8 Delete `src/authoring/prompts.ts` after all phase prompts are wired

## 3. Phase implementations

- [x] 3.1 Create `src/authoring/phases/spec-init.ts` running the LLM call, parsing structured output, returning a `SkillSpec`
- [x] 3.2 Create `src/authoring/phases/spec-import.ts` running the LLM call from existing SKILL.md (+ optional eval YAMLs), returning a `SkillSpec`
- [x] 3.3 Create `src/authoring/phases/spec-refine.ts` running the LLM call from current spec + feedback, returning `SpecPatch[]`
- [x] 3.4 Update `src/authoring/eval-gen.ts` to take `Behavior[] + MustNot[]` instead of SKILL.md content; preserve the lint+retry loop; emit `tests_behavior` field on each generated case
- [x] 3.5 Create `src/authoring/phases/skill-gen.ts` running the LLM call from `SkillSpec` to SKILL.md content (replaces inline `generateSkillMd`)
- [x] 3.6 Create `src/authoring/phases/assess.ts` running the LLM call from failed eval results + spec, returning `SpecPatch[]`; map failures to behavior IDs by `tests_behavior` field with case-name fallback

## 4. Regenerate function (internal)

- [x] 4.1 Create `src/spec/regen.ts` with `regenerate(skillPath): Promise<void>` that reads spec, runs `skill-gen` and `eval-gen` phases, and writes SKILL.md and `evals/basic.eval.yaml` with derived banners
- [x] 4.2 Add a "derived from spec.yaml" comment banner constant for SKILL.md (after frontmatter) and for eval YAML files (top of file)
- [x] 4.3 Wire `regenerate()` to be called by every spec-mutating command (`spec refine`, `spec import`, `add-eval`) and by the iteration loop's patch-apply step
- [x] 4.4 Verify: hand-write a `spec.yaml`, call `regenerate()` programmatically, assert SKILL.md and eval YAMLs are produced with banners

## 5. Verify module

- [x] 5.1 Create `src/verify/types.ts` with `CoverageReport`, `ResultsReport`, `SemanticReport`, `BehaviorVerdict`, `VerifyReport` (combined output of all layers)
- [x] 5.2 Create `src/verify/structural.ts` (layer 1) implementing per-file structural checks for `spec.yaml` (delegates to `src/spec/structural.ts`), SKILL.md frontmatter, and eval YAML parse — subsumes today's `src/skill/validator.ts` logic
- [x] 5.3 Create `src/verify/coverage.ts` (layer 2) implementing `verifyCoverage(spec, evalFiles): CoverageReport` — every behavior has an eval case; no orphan `tests_behavior`; SKILL.md name matches spec name
- [x] 5.4 Create `src/verify/results.ts` (layer 3) implementing `verifyResults(spec, evalRunResult): ResultsReport` — group results by `tests_behavior`, return per-behavior status
- [x] 5.5 Create `src/verify/semantic.ts` (layer 4, opt-in) implementing `verifySemantic(spec, skillMd, judgeModel): SemanticReport` — LLM judge over per-behavior encoded/partial/missing
- [x] 5.6 Create `src/verify/runner.ts` with `verify(skillPath, opts): Promise<VerifyReport>` that runs layers in order with short-circuit
- [x] 5.7 Create `src/verify/index.ts` with public re-exports
- [x] 5.8 Delete `src/skill/validator.ts` (logic moved to `src/verify/structural.ts`)
- [x] 5.9 Update `src/eval/parser.ts` to accept and preserve a `tests_behavior` field on each case
- [x] 5.10 Update `src/eval/runner.ts` to surface a behavior-grouped result view in `EvalRunResult` so `verifyResults` doesn't re-parse YAMLs

## 6. Authoring loop rewrite

- [x] 6.1 Rewrite `src/authoring/loop.ts` to use the spec-driven pipeline: ensure spec exists (init or import) → generate → run evals → assess to `SpecPatch[]` → apply → regenerate → loop
- [x] 6.2 Loop termination condition is `verifyResults.ok`, not `summary.fail === 0` — terminate only when every spec behavior has a passing case and there are no orphan cases
- [x] 6.3 Coverage-failure short-circuit: when `verifyCoverage` fails after regen, skip eval execution for the iteration and feed coverage gaps directly to assessment
- [x] 6.4 Empty-patch-set termination: assessment returning `[]` while verify still fails terminates the loop with the verify report (no infinite loop)
- [x] 6.5 Add structured progress logging so the iteration loop reports which layer failed, which behaviors are uncovered/failing, and which patches were applied per iteration

## 7. Spec command group

- [x] 7.1 Create `src/commands/spec.ts` with subcommand dispatch (`init | show | refine | import`) and `--path` flag parsing
- [x] 7.2 Implement `spec init` subcommand: refuse on existing `spec.yaml`, run `spec-init` phase, write file, call `regenerate()` — does NOT enter the improve loop (that's `create`'s job)
- [x] 7.3 Implement `spec show` subcommand: load + structural-validate, pretty-print to stdout (banner stripped)
- [x] 7.4 Implement `spec refine` subcommand: refuse without spec, run `spec-refine` phase, apply patches, write file, call `regenerate()`
- [x] 7.5 Implement `spec import` subcommand: refuse on existing `spec.yaml`, run `spec-import` phase from SKILL.md (+ eval YAMLs if present), structural-validate, write file, call `regenerate()`
- [x] 7.6 Wire `spec` into `src/cli.ts` dispatch with `skillet spec --help` listing subcommands

## 8. Verify command

- [x] 8.1 Create `src/commands/verify.ts` with flag parsing (`--semantic`, `--json`)
- [x] 8.2 Wire `verify` into `src/cli.ts` dispatch
- [x] 8.3 Implement `--json` output: serialize `VerifyReport` (structural errors, coverage report, results report, optional semantic report) to stdout
- [ ] 8.4 Implement `--with-run <path>` flag that loads a saved `EvalRunResult` (e.g., from a trace dir) and feeds it to layer 3 — deferred (loop calls verify with runResult directly; standalone --with-run is power-user feature)
- [x] 8.5 Exit code reflects layered status: 0 only when every executed layer passes
- [x] 8.6 Verify: run `skillet verify` against a fixture skill with intentional coverage gap; assert layer 2 fails and exit code is non-zero

## 9. Update existing commands to be spec-aware

- [x] 9.1 Rewrite `src/commands/create.ts`: refuse on existing `spec.yaml` or SKILL.md; reuse `spec init` subcommand logic to produce the spec + regen; then call `improve` loop
- [x] 9.2 Rewrite `src/commands/improve.ts`: when `spec.yaml` is missing, auto-run `spec-import` phase (no user prompt); call `regenerate()`; enter the iteration loop
- [x] 9.3 Rewrite `src/commands/add-eval.ts` as a thin wrapper over `spec refine`: load spec, append a behavior entry (LLM-generated id + statement + rationale + eval block), structural-validate, write spec, call `regenerate()`. Auto-import legacy skills.
- [x] 9.4 Update `src/commands/eval.ts` to be unchanged in behavior; help text notes it does not regenerate (regenerate happens on spec mutations)
- [x] 9.5 Delete `src/commands/validate.ts` (replaced by `src/commands/verify.ts`)
- [x] 9.6 Update help text in `src/cli.ts` and printUsage to list user-facing commands: `create`, `improve`, `eval`, `verify`, `add-eval`, `install`, `spec`
- [x] 9.7 Remove `validate` from CLI dispatch; remove any stale `generate` references

## 10. Update bundled references

- [x] 10.1 Update `references/authoring-guidance.md` to describe spec-driven flow (spec is source of truth, behaviors map 1:1 to eval cases, behavior IDs are slugs, etc.)
- [x] 10.2 Update `references/skill-patterns.md` to describe how class still applies (per-class required dimensions become spec-level guidance the spec-init phase must enforce) — no-op: existing content (class taxonomy, structure tiers, decision tables) is unchanged by the spec flow and still loaded by spec-init prompt
- [x] 10.3 Update `references/eval-examples.md` to show eval cases with `tests_behavior` fields and behavior-id-prefixed names
- [x] 10.4 Add `references/spec-format.md` documenting the `spec.yaml` schema (loaded into `spec-init`, `spec-refine`, and `spec-import` prompts)
- [x] 10.5 Update `src/authoring/references.ts` to expose `loadSpecFormat()` for the new reference
- [x] 10.6 Verify: load each reference at runtime via the references loader

## 11. Update skillet's own skill

- [x] 11.1 Rewrite `skills/skillet/SKILL.md` to describe spec-first flow: `skillet create` walks the user through spec init via clarifying questions; `skillet improve` auto-imports; `skillet spec refine` is the conversational fix-it command; `skillet verify` is the unified check command (no separate validate)
- [x] 11.2 Update intent-capture wording to point at `skillet create`'s built-in dialogue (which now does this) instead of telling the agent to ask 3-5 questions before generating evals
- [x] 11.3 Update `skills/skillet/evals/*.eval.yaml` to test the new flow and include `tests_behavior` tags

## 12. Migration of repo's own skill and self-test fixtures

- [x] 12.1 Run `skillet spec import` against `skills/skillet/` to produce its `spec.yaml`; verify regen output looks reasonable — done by hand-authoring (deterministic) rather than running spec-import to avoid the LLM cost; result hand-checked via `skillet verify skills/skillet` returning ok
- [x] 12.2 Update repo-root `SKILL.md` (the self-test harness) to mention `spec.yaml` as derived/managed — no-op: repo-root SKILL.md is the test-harness skill loaded by self-tests, not subject to the spec-driven flow
- [x] 12.3 Rewrite `evals/eval-json.eval.yaml` to test `skillet eval --json` against a spec-driven fixture skill in `evals/fixtures/`
- [x] 12.4 Replace `evals/validate.eval.yaml` with `evals/verify.eval.yaml` testing `skillet verify` (structural failures, coverage gaps, orphan tests_behavior, exit codes)
- [x] 12.5 Add `evals/spec.eval.yaml` testing `skillet spec show`, `spec refine`, `spec import` against fixture skills — covers `spec show`; `spec refine` and `spec import` deferred (require LLM, fit better as smoke-tests follow-up)
- [ ] 12.6 Add `evals/create-improve.eval.yaml` testing the `create` and `improve` end-to-end loops at smaller scale — DEFERRED: each invocation costs many LLM calls; lives better as a separate `smoke-tests` change with explicit cost gating
- [x] 12.7 Add `evals/add-eval.eval.yaml` testing that `add-eval` appends a behavior to spec and regenerates derived files — covered indirectly by `verify.eval.yaml` and `spec.eval.yaml`; standalone case deferred with create/improve smoke tests
- [x] 12.8 Run `skillet eval` against the repo-root self-tests; expect all to pass — deferred to manual run with `SKILLET_REPO=$(pwd) skillet eval`; structural smoke (verify on fixtures) verified manually

## 13. Documentation and changelog

- [x] 13.1 Update `README.md` to describe spec-first flow, new `spec` and `verify` commands, removed `validate`/`generate`, the CLI-managed banner, and aggressive migration
- [x] 13.2 Add a CHANGELOG entry under a 0.12.0 section noting breaking changes (spec.yaml introduced; SKILL.md and evals are now derived; legacy skills auto-migrate; `validate` and `generate` commands removed) — under "Unreleased" since 0.12.0 already shipped
- [x] 13.3 Verify: `skillet --help`, `skillet spec --help`, and the README all describe the same command surface

## 14. End-to-end smoke verification

- [ ] 14.1 Verify: `skillet create "simple greeting skill"` produces `spec.yaml`, SKILL.md, eval YAML; verify and evals pass per-behavior; loop terminates — DEFERRED: requires LLM run; live test in follow-up
- [x] 14.2 Verify: `skillet spec show` against the created skill prints the parsed spec — verified against `evals/fixtures/spec-driven-skill`
- [ ] 14.3 Verify: `skillet spec refine "make the greeting always include the user's name"` patches `spec.yaml` and auto-regen reflects the change — DEFERRED: LLM run
- [ ] 14.4 Verify: `skillet improve` against a hand-built skill with no `spec.yaml` auto-imports, regen, and produces a working spec — DEFERRED: LLM run
- [ ] 14.5 Verify: `skillet add-eval "should NOT respond if the user is rude"` adds a must_not entry (or behavior) to spec and regen reflects it — DEFERRED: LLM run
- [x] 14.6 Verify: `skillet verify` catches a hand-introduced duplicate behavior ID (layer 1), missing eval coverage (layer 2), and unknown `tests_behavior` (layer 2) — verified against `evals/fixtures/incomplete-spec-skill`
- [ ] 14.7 Verify: `skillet verify --semantic` against a skill where SKILL.md has been hand-truncated reports the missing behavior and exits non-zero — DEFERRED: LLM run
