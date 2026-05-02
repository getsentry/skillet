# Tasks

## Shared code-eval contract

- [ ] 1. New file `src/authoring/prompts/_code-eval-contract.ts`
       exporting a single `CODE_EVAL_CONTRACT` string. Body
       articulates the contract: "you produce code-evals — most of
       the assertion surface is `expect(...)` against deterministic
       shapes; prose belongs in the spec entry's rationale, not the
       test body." Includes the named caps (max 1 judge per file,
       max 200 chars criterion, min 2 deterministic per judged
       case) and the banned-pattern list.
- [ ] 2. Both the generator prompt and the verifier prompt import
       and embed `CODE_EVAL_CONTRACT` verbatim. No inlined
       duplicate copies.

## Generator prompt

- [ ] 3. Rewrite `src/authoring/prompts/eval-gen.ts` opening to
       lead with the embedded contract — first section after the
       greeting, before the assertion-plan schema. The contract
       declares what the model is producing AND signals that a
       critic call follows.
- [ ] 4. Move hard caps out of free-form "Hard rules" prose into a
       numbered "Caps" section the model can pattern-match against.
- [ ] 5. Strengthen the "deterministic-first" example: include a
       worked case showing a judge replaced by two specific regex
       checks for the same rule.

## Verify prompt

- [ ] 6. New file `src/authoring/prompts/eval-gen-verify.ts` with
       `buildEvalGenVerifyPrompt()`. Embeds `CODE_EVAL_CONTRACT`
       verbatim so the critic checks against exactly what the
       generator was told. Document the response shape
       (approve | edits[]) and each edit kind inline.
- [ ] 7. Verifier framing reinforced: "your sole job is to verify
       the generator honored the contract above. Approve if the
       contract was honored. Otherwise return specific contract
       violations as PlanEdits."

## PlanEdit types + applier

- [ ] 8. Add `PlanEdit` discriminated union to
       `src/authoring/phases/eval-gen-types.ts`.
- [ ] 9. New module `src/authoring/phases/eval-gen-edits.ts` with
       a pure `applyPlanEdits(plan, edits)`. Deterministic, throws
       on unknown kinds / missing targets / out-of-range indices.
- [ ] 10. Edge cases the applier handles explicitly:
        - `drop-judge` removes the declaration AND every assertion
          referencing it (same for
          `replace-judge-with-deterministic`).
        - `tighten-regex` and `drop-assertion` use 0-based index
          relative to the case's assertion array AT EDIT TIME
          (apply in input order; if a prior edit removed an
          assertion, later indices shift).
        - Edits whose target was already removed throw (caller
          falls back to original plan).

## Renderer hard caps (the contract enforced at write time)

- [ ] 11. Update `validatePlan` in `eval-gen-render.ts` to enforce
        the same caps the contract declares:
        - max 1 judge per plan
        - max 300 chars per criterion (generator targets 200;
          renderer's 300 absorbs minor overruns)
        - reject case with only judge assertions
        - reject single-common-English-word patterns/values
        - reject judges declared but never referenced
- [ ] 12. Each rejection emits a `RenderError` with a specific,
        actionable message naming the rule the generator/verifier
        broke. The renderer is the **last line of contract
        enforcement** — anything that gets past generate + verify
        still has to clear it to land on disk.

## Phase wiring (request → generate → verify → render)

- [ ] 13. New helper `verifyPlan(model, spec, plan, signal)` in
        `eval-gen.ts` that submits an `eval-gen:verify:<id>` job.
        Parses + validates the verifier's JSON response shape;
        returns `{ approve: true } | { approve: false, edits }`.
- [ ] 14. Modify `runEvalGen` per-entry flow to make the three
        stages explicit and observable:
        - **Request**: prompt embeds `CODE_EVAL_CONTRACT` (no code
          change here — it's the prompt content from #3).
        - **Generate**: call `generateForEntry` (existing
          parse-retry loop).
        - **Verify**: call `verifyPlan` once with the resulting
          plan.
        - **Apply + render**: if approve, render + write; if
          edits, try `applyPlanEdits` + `renderEvalFile`. On
          failure, log warn event and write the original plan's
          render (fallback).
- [ ] 15. Telemetry: emit `info` events
        `eval-gen:verify behavior=<id> approve=<bool> edits=<count>`
        so the end-of-command summary shows the verify
        approve-rate. A high edit-rate signals the generator
        prompt needs tightening.

## Smoke / regression (did the contract hold?)

- [ ] 16. Re-run the warden `wrdn-gha-workflows` regen with the
        verify pass enabled. Compare to the prior run (the
        baseline this proposal exists to fix):
        - judge count should drop (target: ≤10, was 17)
        - average criterion length should drop (target: ≤180
          chars, was ~280)
        - file count, case count unchanged
        - verify approve-rate ≥60% on first pass (signal that the
          generator's contract framing is working)
- [ ] 17. Spot-check 3 files from the regen for the qualitative
        signal: are deterministic checks more specific? Did
        verify replace any judges with deterministic alternatives?
        Are tests testing real things (specific tokens, fixture
        filenames, payload syntax) rather than English buzzwords?
- [ ] 18. Soak test: run on a second skill (e.g. `wrdn-authz`'s
        spec.yaml from warden-skills main) to confirm the verify
        pass holds up across domains.

## Validation

- [ ] 19. `npm run typecheck`
- [ ] 20. `npm run check` (lint baseline 0 errors)
- [ ] 21. `openspec validate 2026-05-01-eval-gen-verify-pass --strict`
