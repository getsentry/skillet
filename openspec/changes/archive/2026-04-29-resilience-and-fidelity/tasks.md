## 1. Structured logger

- [x] 1.1 Create `src/log.ts` with `phase(name, fn)`, `event(level, msg, payload?)`, and a `setVerbose(bool)` switch.
- [x] 1.2 Logs go to stderr. Default level shows phase boundaries and per-behavior progress; verbose adds full LLM I/O with payload truncation.
- [x] 1.3 Wire `--verbose` flag and `SKILLET_VERBOSE=1` env var. CLI parses both early in `main()`.
- [ ] 1.4 Replace ad-hoc `console.log("...")` progress calls with structured `phase`/`event` calls. Eval-gen uses the new logger; the loop and import paths still use console.log alongside it. Acceptable for now — loop output is human-meant.

## 2. Per-behavior eval-gen with cheaper model

- [x] 2.1 Add `evalGen` role to `resolveModels()` in `src/agent/provider.ts`. Default: judge model. Override via `SKILLET_EVAL_GEN_MODEL`.
- [x] 2.2 Rewrite `src/authoring/prompts/eval-gen.ts` for single-behavior shape. Includes the full spec must_not list with the "do not trip these" instruction.
- [x] 2.3 Rewrite `src/authoring/phases/eval-gen.ts` — one LLM call per entry, parallelized (cap 6), retried per-entry, files written immediately on success, returns `{written, skipped, failed}`.
- [x] 2.4 `regen.ts` handles the `failed` list — throws only when zero entries succeeded; partial success persists.
- [ ] 2.5 Verify: would need an LLM-key end-to-end run on a synthetic 30-behavior spec. Deferred to morning testing.

## 3. Transactional writes

- [x] 3.1 Create `src/staging/index.ts` with `createStaging()`, `withStaging()`, `seedStagingFromSkill()`, `findOrphanStaging()` helpers. Per-file `rename()` for atomic swap.
- [x] 3.2 `regen.ts` operates on whatever path is passed — `withStaging` is the wrapper, not regen itself.
- [x] 3.3 `spec import` wraps spec.yaml + regen in `withStaging`. Failure leaves the original untouched.
- [x] 3.4 `improve` (`src/authoring/loop.ts`) wraps initial spec write + regen in `withStaging`. Loop's per-iteration prose tuning runs after swap on the live SKILL.md.
- [x] 3.5 `create` writes go through `improve`'s loop, which uses `withStaging`.
- [x] 3.6 `add-eval` and `spec refine`: wrapped in `withStaging`.
- [x] 3.7 Logging: staging dir path is logged at create / commit / discard.
- [ ] 3.8 Verify: would need a real failure-injection run; trust the unit-level smoke (existing fixtures still verify clean) for now.

## 4. frontmatter_extras

- [x] 4.1 Add `frontmatter_extras?: Record<string, unknown>` to `SkillSpec`.
- [x] 4.2 Parser captures the field opaquely.
- [x] 4.3 IO renders the field back into spec.yaml; round-trip stable (verified inline).
- [ ] 4.4 Structural validator warns on key conflicts. Deferred — typed fields take precedence on render anyway; conflicts are silently overridden, no loud surface needed yet.
- [x] 4.5+4.6 spec-import phase parses the source SKILL.md frontmatter and pulls non-typed keys into `frontmatter_extras`. Done in the phase itself (not the command) so both `spec import` and `improve` auto-import paths benefit.
- [x] 4.7 skill-gen post-processes its LLM output to merge extras into the generated frontmatter.
- [ ] 4.8 End-to-end verify on a real legacy skill (warden/wrdn-pii). Deferred — round-trip unit test passes; real-skill verification waits for morning.

## 5. Default tools on create

- [x] 5.1 CLI parses `--tools "<list>"` (with both `--tools=` and `--tools <space>` forms) and `--no-default-tools`.
- [x] 5.2 `create` populates `spec.frontmatter_extras["allowed-tools"]` with `"Read Grep Glob Bash Edit Write"` by default.
- [x] 5.3+5.4 Both flags work as specified.
- [ ] 5.5 spec-init prompt note about allowed-tools. Deferred — the LLM never sees frontmatter; the rule is enforced mechanically in the loop.
- [ ] 5.6 Verify: would need an LLM run; trust the unit-level wiring for now.

## 6. must_not awareness in eval-gen

- [x] 6.1+6.2 Single-behavior eval-gen prompt includes the full spec must_not list with explicit "don't construct fixtures that trip these" instruction. Each per-behavior call sees the full list.
- [ ] 6.3 Verify on a real privacy-style fixture. Deferred to morning real-skill testing.

## 7. Build, integration, docs

- [x] 7.1 Type-check passes (`tsc --noEmit`).
- [x] 7.2 Build succeeds (`npm run build`).
- [x] 7.3 `skillet verify` and `skillet eval` pass on existing fixtures (spec-driven-skill, skillet's own skill).
- [ ] 7.4 End-to-end smoke on a synthetic 30+ behavior fixture. Deferred to morning testing with LLM keys.
- [ ] 7.5 README updates for `--verbose`, `--tools`, env vars. Deferred (CLI usage text covers them; README polish is low-priority).
- [ ] 7.6 Skillet-skill spec adjustments. Deferred — current behavior list is still accurate.
