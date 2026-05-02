## Why

Skillet's current authoring loop derives behavioral clauses from prose on every iteration: the eval-gen prompt asks the LLM to "read SKILL.md as a spec, list every clause", and the assessment phase returns free-text nudges that drive whole-file regeneration. There is no durable structured representation of intent, so iteration churns prose instead of converging on a stable artifact, and there is no way to capture a user's expectations before generation kicks off.

We want a structured spec captured once (with skillet asking clarifying questions), then used as the deterministic input to SKILL.md and eval generation. Iteration patches the spec, not the derived files.

## What Changes

- **NEW** `spec.yaml` lives at the skill root. It is the source of truth for `name`, `intent`, `class`, `triggers`, `behaviors`, and `must_not` rules. Each behavior optionally carries an `eval` block (setup, prompt, expect/criteria) that drives one eval case.
- **NEW** `spec.yaml` is CLI-managed. The file opens with a banner declaring it must not be hand-edited; writes flow through `skillet spec` subcommands. SKILL.md and `evals/*.eval.yaml` become derived artifacts regenerated from the spec.
- **NEW** `skillet spec [path] show | refine "<feedback>" | import` command: subcommands for reading the spec, natural-language patching, and reverse-engineering from a legacy SKILL.md. Every mutation (`refine`, `import`) automatically regenerates SKILL.md and eval YAMLs so derived files never lag behind the spec.
- **MODIFIED** `skillet create "<desc>"`: runs spec init (LLM-backed dialogue → spec.yaml) + auto-regen + `improve` loop. Same UX as before, spec-driven internals. Standalone "spec init" is not exposed; `create` is the only entry point that authors a new spec from a description.
- **MODIFIED** `skillet improve [path]`: auto-runs `spec import` if no spec exists. Iteration loop becomes run → verify → assess → produce structured `SpecPatch[]` → apply to spec → regenerate → loop. Auto-regen runs after every loop iteration's patch step.
- **MODIFIED** `skillet add-eval [path] "<behavior>"`: appends a `behaviors[]` entry (with optional `eval:` block) to spec.yaml then auto-regens. No longer writes eval YAML directly. Internally a named shortcut for `spec refine "add behavior: ..."`.
- **REMOVED** `skillet validate` as a standalone command. Per-file structural checks fold into `skillet verify`, which always runs the cheap structural pass first and short-circuits on failure. The `validate` capability is consolidated into `spec-verification`.
- **NEW** `skillet verify [path] [--semantic] [--json]` command: structural verification (per-file lint + cross-artifact: every behavior has an eval case, every `tests_behavior` resolves) by default, no LLM, sub-second. `--semantic` opts in to LLM-judged coverage of SKILL.md against the spec. Run automatically by the iteration loop and exposed as a standalone command for CI / manual checks.
- **MODIFIED** Assessment phase returns `SpecPatch[]` (`update_behavior`, `add_behavior`, `update_eval`, etc.) instead of free-text `skillChanges`/`evalChanges` nudges. The patcher applies them deterministically. Assessment input includes verification failures (missing coverage, failing per-behavior results), so missing-eval and failing-eval failures get distinct, targeted patches.
- **MODIFIED** Generated eval cases tag the behavior they test via a `tests_behavior` field (and case name convention `<behavior_id>__<slug>`) so verification and assessment can map cases and failures back to behavior IDs.
- **MODIFIED** Authoring loop: structural verify after `generate`, result verify after `eval run`. Loop terminates only when every spec behavior has a passing eval case, not just when total pass/fail count looks clean.
- **MODIFIED** Self-test evals at the repo root (`evals/*.eval.yaml`): rewritten to cover the new commands (`spec init/show/refine/import`, `generate`, `verify`) and the spec-driven loop. No deferred fixtures.
- **BREAKING** Skills without a `spec.yaml` cannot be improved without first running `spec import` (auto-triggered, not user-initiated). Hand edits to SKILL.md or eval YAMLs after generation will be overwritten on the next `generate`.

## Capabilities

### New Capabilities
- `skill-spec`: The `spec.yaml` schema, parser, validator, IO (banner preservation), and patcher. Defines `SkillSpec`, `Behavior`, `MustNot`, `BehaviorEval`, and `SpecPatch` types and the YAML grammar.
- `spec-verification`: Uses `spec.yaml` as an oracle for cross-artifact and result-based verification. Defines `verifyCoverage` (structural: every behavior has an eval case), `verifyResults` (post-run: every behavior has a passing case), and optional `verifySemantic` (LLM judge: SKILL.md encodes every behavior). Run by the loop and exposed as `skillet verify`.

### Modified Capabilities
- `skill-authoring`: Authoring loop becomes spec-driven. Phase prompts split per concern (spec-init, spec-refine, spec-import, skill-gen, eval-gen, assess) and each takes structured spec input rather than free-text. Loop runs structural verification after regen and per-behavior result verification after eval execution. Assessment produces `SpecPatch[]` informed by both eval failures and verification failures.
- `cli`: Adds `spec` subcommand group (`show`, `refine`, `import`) and `verify` command. Updates `create`, `improve`, `add-eval` to operate on the spec. Removes `validate` standalone (folded into `verify`). No standalone `generate` or `spec init` — both are internal stages of `create` / spec mutations.

### Removed Capabilities
- `validation`: Folded into `spec-verification`. The per-file structural checks (SKILL.md frontmatter, eval YAML parse, spec.yaml schema) become the cheap first pass inside `verify`. The standalone `skillet validate` command is removed; users run `skillet verify` instead.

## Impact

- New: `src/spec/` module (types, parser, structural validator, io, patcher, slug).
- New: `src/verify/` module (structural per-file checks + coverage, results, semantic verification — replaces `src/skill/validator.ts`).
- New: `src/authoring/prompts/` directory; `src/authoring/prompts.ts` splits per phase.
- New: `src/commands/spec.ts` (subcommand dispatch) and `src/commands/verify.ts`.
- Removed: `src/commands/validate.ts` (replaced by `verify.ts`), `src/skill/validator.ts` (logic moves to `src/verify/`).
- Modified: `src/authoring/loop.ts`, `src/authoring/eval-gen.ts`, `src/commands/{create,improve,add-eval}.ts`, `src/cli.ts`, `src/eval/parser.ts` (accept `tests_behavior`), `src/eval/runner.ts` (surface per-behavior result grouping in `EvalRunResult`).
- Modified: `references/eval-examples.md` and `references/authoring-guidance.md` reflect spec-driven flow.
- New: `references/spec-format.md` documenting the `spec.yaml` schema.
- Modified: `skills/skillet/SKILL.md` agent instructions describe the new spec-first flow.
- Modified: `evals/*.eval.yaml` self-tests rewritten to cover the new commands and the spec-driven loop end-to-end.
- Existing eval YAMLs gain a `tests_behavior` field to support coverage mapping during verification and assessment.
- No new runtime dependencies — pure refactor inside skillet.
