# Tasks

## Contract + types

- [ ] 1. Rewrite `src/authoring/prompts/_code-eval-contract.ts`
       to lead with the judge-first framing. Three first-class
       assertion shapes (structural, tool-call, named LLM-rubric
       judges); explicit ban on regex/substring against
       `result.session.outputText`; updated caps (≤5 judges per
       file, criterion ≤200 chars, multiple judges per case
       allowed).
- [ ] 2. Drop banned assertion kinds from the schema discussed
       in the contract; update the worked examples to show
       structural-output and judge-first cases (one each).

## Type system

- [ ] 3. `src/authoring/phases/eval-gen-types.ts`: remove
       `OutputMatchesAssertion`, `OutputContainsAssertion`,
       `OutputNotContainsAssertion` from the `Assertion` union.
       Keep `OutputMatchObjectAssertion`, `ToolCallsAssertion`,
       `JudgeAssertion`.
- [ ] 4. Add new edit types: `SplitJudgeEdit`,
       `AddJudgeEdit`. Remove `TightenRegexEdit`.

## Renderer

- [ ] 5. `src/authoring/phases/eval-gen-render.ts`: drop the "≤1
       judge per file" cap (raise to ≤5). Drop the "≥2
       deterministic per judged case" check. Keep all other caps.
- [ ] 6. Renderer's case for the now-removed assertion kinds:
       since the type is removed, TypeScript prevents them at
       compile time. For runtime safety (verifier could still
       emit a banned kind via a JSON assertion edit that doesn't
       round-trip the type), add an explicit check that throws
       a `RenderError` with the migration message naming the
       kind and the recommended replacement.

## PlanEdit applier

- [ ] 7. `src/authoring/phases/eval-gen-edits.ts`: add
       `applySplitJudge` and `applyAddJudge` handlers.
- [ ] 8. Remove `applyTightenRegex` (the assertion type is gone,
       no targets to tighten).
- [ ] 9. `applySplitJudge` validation:
       - replacements must be non-empty and have valid names
         (PascalCase + Judge suffix)
       - caseAssignments must reference at least one of the
         replacement judge names
       - the original judge name must exist in `plan.judges`
       For each case that referenced the original judge, replace
       the `{ kind: "judge", judgeName: <orig> }` assertion with
       N consecutive `{ kind: "judge", judgeName: <replacement> }`
       assertions, one per name in `caseAssignments`.
- [ ] 10. `applyAddJudge` validation:
        - judge.name must be valid + not already declared
        - caseNames must all exist
       Append a `{ kind: "judge", judgeName: <new> }` assertion
       to each named case AND push the new judge into
       `plan.judges`.

## Generator prompt

- [ ] 11. `src/authoring/prompts/eval-gen.ts`: update the
        assertion-kinds table to drop the banned kinds. Drop the
        old worked examples (which used regex). Add two new
        examples:
        - **Structural-first** (skill emits a finding block) —
          uses `output-match-object` + `tool-calls` + 1 narrow
          judge for the explanation.
        - **Judge-first** (free-form text rule, e.g. pwn-request
          explanation) — declares 3 narrow judges, each testing
          one property; case has 3 `judge` assertions.
- [ ] 12. Update the picking-the-right-shape guide:
        - "Required keyword in output": gone — was regex, now use
          a judge if the skill emits free-form, or
          `output-match-object` if structured.
        - Keep tool-calls and structured-output guidance.
        - Add: "Multiple judges per case" guidance.

## Verifier prompt

- [ ] 13. `src/authoring/prompts/eval-gen-verify.ts`: update edit
        kinds (drop `tighten-regex`, add `split-judge`,
        `add-judge`); reframe the "when to return edits" rules
        around judge breadth and structural fits, not regex
        tightening. Embed the same updated `CODE_EVAL_CONTRACT`.

## Phase wiring

- [ ] 14. `src/authoring/phases/eval-gen.ts`: no flow change —
        the request → generate → verify → render pipeline stays
        the same. Just confirm the `parseVerdict` shape still
        accepts the new edit kinds (it accepts arbitrary
        records, so no parser change needed; the applier
        validates).

## Smoke / regression

- [ ] 15. Re-run the warden `wrdn-gha-workflows` regen with the
        new contract. Compare to the prior run:
        - regex/substring assertions: 0 (banned)
        - judges per file: avg ~3 (was 0.55, since most files
          had 0-1 judges under the prior contract)
        - cases with only judges: most cases for free-form
          rules (e.g. report-pwn-request)
        - cases with structural assertions: must_nots and any
          rule about specific tool calls or shape
        - file count, case count: roughly stable or slightly
          smaller (cases get tighter)
- [ ] 16. Spot-check: pick `report-pwn-request`,
        `exclude-non-findings`, and `calibrate-severity` from
        the regen and confirm:
        - No `output-matches`, `output-contains`,
          `output-not-contains` (renderer rejects them; should
          never appear).
        - Judges are narrow (one property each).
        - Reads as code: `await expect(result).toSatisfyJudge(...)`
          lines plus structural where applicable.
- [ ] 17. Soak test: run on `wrdn-authz` spec.yaml (different
        domain) to confirm the contract holds.

## Validation

- [ ] 18. `npm run typecheck`
- [ ] 19. `npm run check` (lint baseline 0 errors)
- [ ] 20. `openspec validate 2026-05-01-judge-first-evals --strict`
