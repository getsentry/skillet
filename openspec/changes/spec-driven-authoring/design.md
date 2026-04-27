## Context

Skillet's authoring loop today operates on prose. `src/authoring/loop.ts:51` runs four phases — generate SKILL.md, generate evals, run, assess — and the only durable state between iterations is the SKILL.md and eval YAML files themselves. Each iteration re-derives behavioral clauses from prose; assessment returns natural-language nudges (`assessResults` at `src/authoring/loop.ts:224`) that drive whole-file regeneration of SKILL.md and `evals/basic.eval.yaml`.

This makes iteration imprecise (the LLM has to re-read prose, re-extract clauses, re-write a whole file to change one rule) and means there is no place to capture user expectations before generation begins. The current `skillet create "<desc>"` flow takes a one-line description and immediately produces SKILL.md without any structured intent capture.

The codebase is pre-1.0 (~v0.11) and not widely deployed, so we can make breaking changes without migration tooling beyond `spec import`.

## Goals / Non-Goals

**Goals:**
- A `spec.yaml` artifact that is the single source of truth for every authored skill — captures intent, behaviors, must-nots, triggers, and per-behavior eval hints in a structured, machine-managed form.
- Spec is CLI-mediated: `skillet spec` subcommands are the only supported way to modify `spec.yaml`. A frontmatter banner makes this explicit. SKILL.md and eval YAMLs become derived artifacts.
- Generation (`spec → SKILL.md + evals`) is a deterministic, idempotent function. Re-running `generate` on an unchanged spec produces byte-identical output (modulo LLM determinism in the gen prompts themselves).
- Spec doubles as a verification oracle: every behavior ID is a checkable contract, not just a generation hint. The loop verifies coverage (every behavior has an eval case) and per-behavior results (every behavior has a passing case) before declaring success.
- Iteration loop converges on the spec, not on prose. Assessment returns structured `SpecPatch[]` operations that are applied deterministically and is informed by both eval failures and verification failures.
- Eval cases carry the behavior ID they test, so failures and coverage gaps both map back to spec entries.
- Existing skills auto-migrate via `spec import` on first `improve` invocation.
- Skillet's own self-test evals cover the new flow end-to-end, including the verify loop. No deferred fixtures.

**Non-Goals:**
- Coverage matrices, iteration journals, sources/evidence tracking, or other "management tracking" content stored *inside* the spec. The spec stays input-only; verification computes coverage on demand from spec + evals + run results, it doesn't materialize a coverage map into the spec file.
- Drift detection on SKILL.md and eval YAMLs. Pre-1.0 we clobber on regenerate; the banner is the only safeguard.
- Backwards compatibility with skills authored under the prose-driven flow. They auto-migrate; we do not preserve the prose-driven path.
- New runtime dependencies. The spec and verify modules are plain TypeScript + the existing `yaml` parser; semantic verification reuses the existing judge model.
- Authoring-time conversational UX beyond `spec init` and `spec refine`. Imperative `add-behavior` / `edit-behavior` subcommands are deferred.
- Semantic verification (LLM-judged SKILL.md ↔ behaviors) running by default. It is opt-in via `--semantic` and not part of the auto-loop in v0; the structural verify checks are.

## Decisions

### 1. `spec.yaml` is YAML, not Markdown

**Decision**: Use `spec.yaml` (YAML, structured) at the skill root. Open with a comment-banner declaring CLI-managed status.

**Rationale**: The spec is interacted with through CLI subcommands, not hand-edited. YAML is trivial to parse and rewrite programmatically; markdown with structured sections is fiddly to round-trip. Skillet already parses `evals/*.eval.yaml` with the same library, so adding a second YAML schema is a minor incremental cost.

**Alternatives considered**:
- Markdown SPEC.md with named sections (cramer-style in getsentry/skills#128): friendlier to read raw, but parsing structured fields like `behaviors[]` out of markdown is brittle when the CLI also has to re-emit them.
- Hybrid markdown + fenced YAML blocks: best for human reading, worst parsing complexity. Defer until there's a reading workflow that needs it.
- JSON: equivalent to YAML structurally, worse for the "readable banner" goal.

### 2. Spec is input-only

**Decision**: The spec contains only generation inputs: `name`, `class`, `intent`, `triggers`, `behaviors`, `must_not`. No `coverage` map, no `iterations[]` journal, no `sources[]` provenance.

**Rationale**: Per the design conversation, spec is a build artifact, not a tracking system. Iteration history, coverage data, and provenance can be reconstructed from git history and eval YAMLs if ever needed. Keeping the spec lean keeps the LLM prompts that consume it focused.

**Alternatives considered**:
- Full cramer-style SPEC.md with sources/evidence/coverage/iterations: rejected as too much complexity for v0.

### 3. Banner + CLI-mediated writes; no drift detection

**Decision**: `spec.yaml` opens with a comment banner stating it is managed by skillet and must not be hand-edited. Writes flow through `skillet spec` subcommands. SKILL.md and eval YAMLs gain a similar but milder banner ("derived from spec.yaml; regenerated on `skillet generate`"). We do not store content hashes or detect drift in derived files; if a user hand-edits SKILL.md and re-runs `generate`, their edits are lost. Git is the safety net.

**Rationale**: Pre-1.0 simplicity. Drift detection adds significant code (hashing, storage, reconciliation prompts) for a problem that may not exist in practice. If drift becomes a real complaint, we add it then.

**Alternatives considered**:
- Content-hash drift detection with `skillet spec sync` to import edits back: deferred.

### 4. Single eval case per behavior

**Decision**: Each `behavior` and each `must_not` produces exactly one eval case. The behavior's optional `eval` block carries one `prompt` and one `expect` (literal substring) or `criteria` (judge string). Edge cases are expressed as additional behaviors, not as additional cases per behavior.

**Rationale**: 1:1 mapping makes coverage trivial (every behavior_id should have a passing case), case naming deterministic (`<behavior_id>__<slug>`), and the prompt-to-clause relationship unambiguous. If a real edge case needs its own test, it deserves its own behavior entry — that surfaces it as a first-class rule.

**Alternatives considered**:
- 1:N (each behavior produces a list of cases including positive + edge + negative): more flexible but blurs the spec/test boundary; defer until we hit a real use case the 1:1 model can't express.

### 5. Behavior IDs are auto-generated slugs

**Decision**: Behavior IDs are kebab-case slugs derived from the statement on creation (e.g. `flag-n-plus-one-in-loops`). The CLI generates them; users can override via `skillet spec edit-behavior <old-id> --id <new-id>` (deferred until imperative subcommands ship).

**Rationale**: Slugs read better in eval case names (`flag-n-plus-one-in-loops__loop_over_books` vs `B1__loop_over_books`) and survive insertion/deletion of other behaviors (no renumbering). They double as the stable join key between spec and eval results.

**Alternatives considered**:
- Numeric IDs (B1, B2, ...): simpler to generate, but renumbering on delete creates churn and hurts git diffs.

### 6. Assessment returns `SpecPatch[]`, not free text

**Decision**: The assessment LLM call produces a JSON array of patch operations:

```ts
type SpecPatch =
  | { op: "update_behavior"; id: string; field: "statement" | "rationale"; value: string }
  | { op: "add_behavior"; behavior: Behavior }
  | { op: "remove_behavior"; id: string }
  | { op: "update_eval"; behavior_id: string; eval: BehaviorEval }
  | { op: "update_must_not"; id: string; field: "statement" | "rationale"; value: string }
  | { op: "add_must_not"; must_not: MustNot }
  | { op: "remove_must_not"; id: string }
  | { op: "add_trigger"; kind: "should" | "should_not"; phrase: string }
  | { op: "remove_trigger"; kind: "should" | "should_not"; phrase: string }
  | { op: "update_intent"; value: string };
```

Patches are validated, then applied by `src/spec/patcher.ts`. The patcher fails loudly on unknown ops or missing IDs — invalid patches surface as iteration errors rather than silent wrong edits.

**Rationale**: Lifts the assessment LLM out of the "rewrite a whole file" task into the "name the smallest fix" task, which it does much better. Failed patches are a debugging signal (the assessor mis-identified IDs), not a silent quality drop.

**Alternatives considered**:
- Free-text feedback fed back into a regenerator: today's approach; the bug we're fixing.
- JSON Patch (RFC 6902) over the spec object: too low-level — the assessor would have to know YAML paths. Domain-specific patch ops are easier for an LLM to produce correctly.

### 7. Eval cases tag their behavior

**Decision**: Generated eval cases get a `tests_behavior` field in the YAML, populated by the eval generator from the behavior id:

```yaml
evals:
  - name: flag-n-plus-one-in-loops__review_views_py
    tests_behavior: flag-n-plus-one-in-loops
    turns: ["Review views.py for performance issues"]
    checks:
      - output_contains: "select_related"
```

The eval parser ignores unknown fields today, so this is forward-compatible. Assessment reads `tests_behavior` to map case results back to behavior IDs. If the field is absent (legacy or hand-written cases), we fall back to parsing the case name for the slug prefix.

**Rationale**: A structured field is more robust than relying on naming convention alone, but the naming convention is kept as a fallback so cases authored before the `tests_behavior` field shipped continue to map correctly.

**Alternatives considered**:
- Naming convention only: works but fragile when names get edited.
- Separate `<skill>/coverage.yaml` mapping file: redundant with the per-case tag.

### 8. Aggressive migration via `spec import`

**Decision**: The first time `skillet improve` runs against a skill without `spec.yaml`, it auto-runs `spec import` (LLM extracts behaviors and triggers from existing SKILL.md prose, links existing eval cases to behavior IDs by name match), writes `spec.yaml`, regenerates SKILL.md and eval files from the new spec, then enters the normal loop. The user is not asked. `skillet create` always starts with `spec init`. There is no soft path that preserves the prose-driven flow.

**Rationale**: Pre-1.0 simplicity. Every existing skill in the wild is small and easily reproduced; the cost of a one-time auto-import is low. Maintaining two parallel pipelines for years is high.

**Alternatives considered**:
- Soft migration (spec is opt-in): rejected as ongoing maintenance burden.

### 9. Single verify command, layered checks

**Decision**: One `skillet verify` command that runs three layers in order, short-circuiting on the first failure layer:

| Layer | Question | LLM? | Speed |
|---|---|---|---|
| 1. Structural | Each file (spec.yaml, SKILL.md, evals/*.eval.yaml) parses and has its required fields | no | <1s |
| 2. Cross-artifact | Spec / SKILL.md / evals agree (every behavior has an eval case; every `tests_behavior` resolves; SKILL.md `name` matches spec `name`) | no | <1s |
| 3. Per-behavior results | When run results are available, every spec behavior has a passing case | no | <1s |
| 4. Semantic (opt-in) | SKILL.md actually encodes every spec behavior | yes (judge) | ~10s |

Layers 1–3 always run. Layer 4 runs only when `--semantic` is passed.

**Rationale**: The original split between `validate` (per-file) and `verify` (cross-artifact) preserved a no-LLM contract that `verify` already honors by default. Splitting them just doubled the user's mental load — a user who wants to know "is my skill OK?" wants both passes, every time. Folding gives one command that runs cheap structural checks first and fails fast, with semantic as the explicit deeper check.

The `validation` capability and `src/skill/validator.ts` are removed; their logic moves into `src/verify/structural.ts` as the layer 1 implementation.

**Alternatives considered**:
- Keep `validate` and `verify` as separate commands: rejected — no real workflow distinguishes "I want only structural" from "I want everything cheap".
- Single `verify` that always runs semantic: too expensive for the cheap-pre-flight use case.

### 10. Spec mutations auto-regenerate

**Decision**: Every CLI operation that writes `spec.yaml` (`create`'s init step, `spec refine`, `spec import`, `add-eval`, and the iteration loop's patch step) immediately regenerates SKILL.md and `evals/*.eval.yaml`. There is no standalone `skillet generate` user command. Internally, `regenerate(specPath)` is a function called by every mutation path.

**Rationale**: The spec is only useful as a source of truth if derived files stay in sync. Forcing users to remember a `generate` step after every spec edit is busywork and creates a window where derived files lag the spec — a footgun. Auto-regen costs one to two LLM calls per mutation, which is the natural cost of editing the source of truth anyway.

Internal consumers (the iteration loop, the CLI dispatch) can still call the underlying `regenerate()` function directly without re-validating; the user-facing surface is just simpler.

**Alternatives considered**:
- Standalone `skillet generate` command: rejected — exposes an internal stage as user surface, adds a step users will forget.
- Lazy regen on next `verify` or `eval`: rejected — surprising semantics; users expect `eval` to run what's on disk, not to regenerate first.

### 11. Verify integrates into the iteration loop

**Decision**: The loop runs verify in two places:

```
generate → verifyCoverage → run evals → verifyResults → assess → patch → loop
            (structural)                 (per-behavior)
```

`verifyCoverage` after `generate` catches the case where eval-gen drops a behavior on the floor (LLM produced fewer cases than there are behaviors). Failure here goes straight to assessment with a `missing eval case for behavior X` signal — no need to run evals first.

`verifyResults` after `eval` runs replaces the today's "did all cases pass" check with "did every behavior get a passing case". Two failures look identical at the case level today but have different fixes:
- **Missing eval** (covered after `verifyCoverage`): assessor produces `update_eval` to add the eval block, then we regenerate.
- **Failing eval** (covered after `verifyResults`): assessor produces `update_behavior` (clarify rule) or `update_eval` (fix the test).

The loop terminates on `verifyResults` returning all-green per-behavior, not on `summary.fail === 0`. The two are equivalent only when every spec behavior has at least one case — the verify step makes that an enforced invariant, not an accident.

**Rationale**: The whole reason we built a structured spec is to use it as an oracle. Without verify integrated into the loop, the spec is just a fancier prompt and the iteration signal is no better than today's prose-driven flow.

**Alternatives considered**:
- Verify only at the end of the loop, after evals pass: misses the missing-coverage case (which would just look like a passing eval run because the missing case never ran).
- Always run semantic verify in the loop: too expensive (extra LLM call per iteration); not necessary when the gen prompts are well-tuned.

### 12. Module layout

```
src/
  spec/
    types.ts        # SkillSpec, Behavior, MustNot, BehaviorEval, SpecPatch
    parser.ts       # YAML → SkillSpec
    structural.ts   # spec.yaml schema lint (unique IDs, required fields)
    io.ts           # read/write spec.yaml preserving banner
    patcher.ts      # apply SpecPatch[] to a SkillSpec
    slug.ts         # statement → kebab-case id
    regen.ts        # regenerate(specPath): runs skill-gen + eval-gen, writes derived files
    index.ts        # public re-exports
  verify/
    structural.ts   # layer 1: per-file lint (subsumes today's src/skill/validator.ts)
    coverage.ts     # layer 2: verifyCoverage(spec, evalFiles): CoverageReport
    results.ts      # layer 3: verifyResults(spec, evalRunResult): ResultsReport
    semantic.ts     # layer 4: verifySemantic(spec, skillMd, judgeModel): SemanticReport
    types.ts        # CoverageReport, ResultsReport, SemanticReport, BehaviorVerdict
    runner.ts       # verify(specPath, opts): runs layers in order, short-circuits
    index.ts        # public re-exports
  authoring/
    loop.ts         # spec-driven orchestrator
    prompts/
      spec-init.ts      # description → spec (conversational; called by `create`)
      spec-refine.ts    # feedback → SpecPatch[]
      spec-import.ts    # SKILL.md + evals → spec
      skill-gen.ts      # spec → SKILL.md
      eval-gen.ts       # spec → eval YAMLs
      assess.ts         # eval + verify failures → SpecPatch[]
    references.ts   # loader for bundled refs (adds spec-format.md)
  commands/
    spec.ts         # spec show / refine / import dispatch (auto-regen on mutations)
    verify.ts       # verify command (--semantic, --json)
    create.ts       # spec init (inline) + regen + improve loop
    improve.ts      # auto-import + improve loop
    add-eval.ts     # add behavior to spec + auto-regen (alias for spec refine)
    eval.ts         # unchanged behavior; result grouping by tests_behavior added in runner
    install.ts      # unchanged
  agent/            # unchanged
  eval/             # parser accepts tests_behavior field; runner groups results
  skill/            # loader.ts unchanged; validator.ts removed (logic moved to verify/structural.ts)
  output/           # unchanged
```

Removed from previous design: `src/commands/generate.ts` (no standalone command — `regen.ts` is internal), `src/commands/validate.ts` (replaced by `verify.ts`), `src/skill/validator.ts` (logic moved into `src/verify/structural.ts`).

`src/authoring/prompts.ts` (the current monolith) is replaced by `src/authoring/prompts/` directory with one file per phase. `src/authoring/eval-gen.ts` stays for the lint+retry loop but now takes a `Behavior[]` instead of SKILL.md content. `src/eval/runner.ts` adds an optional behavior-grouped result view to `EvalRunResult` so `verifyResults` doesn't have to re-parse the YAMLs.

## Risks / Trade-offs

- **[Spec import on legacy skills produces a poor spec]** → The reverse-engineered spec is only as good as the LLM's behavior extraction from prose. Mitigated by running the normal `improve` loop after import — failures will surface mis-extracted behaviors, and the assessor can patch them. Worst case the user runs `skillet spec init` from scratch.

- **[Hand edits to SKILL.md silently lost]** → A user who skips the banner and edits SKILL.md directly will be surprised when `generate` clobbers their work. Mitigated by making the banner unambiguous and putting the same banner on derived eval YAMLs. If complaints accumulate, add drift detection in v1.

- **[Patch operations don't cover every assessment outcome]** → The fixed `SpecPatch` op set may not express some fix the assessor wants to make. Mitigated by failing loudly when the assessor produces a malformed op (so we discover gaps quickly) and by allowing the assessor to chain multiple patches in one iteration. New ops can be added incrementally.

- **[Eval-gen produces brittle deterministic regen]** → If the LLM is non-deterministic across runs, "regenerate from same spec" produces different SKILL.md / evals. Mitigated by holding the LLM temperature low for gen prompts and accepting that semantic equivalence (not bytewise) is the contract.

- **[Imperative subcommands deferred]** → `spec refine` may be too coarse for some user intents that an imperative `edit-behavior` would handle directly. Mitigated by keeping `refine` LLM-backed and capable of handling natural-language nudges, and by adding imperative subcommands later if usage patterns demand them.

- **[Semantic verify is opt-in]** → Default loop relies on structural verify only. A skill where SKILL.md fails to encode a behavior but the eval somehow passes (because the eval prompt happens to elicit the right behavior despite SKILL.md being wrong) won't be caught in the default flow. Mitigated by exposing `skillet verify --semantic` as a manual deeper check users can run before declaring a skill done; the gen prompts are already structured to emit one section per behavior, so this failure mode is rare in practice.

- **[Verify becomes a third quality gate users must pass]** → Adds steps to the user's mental model: validate → verify → eval. Mitigated by `improve` and `create` running both gates internally; users only see `verify` if they ask for it. The standalone command exists for power users and CI.
