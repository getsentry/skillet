## 1. Structured logger

- [ ] 1.1 Create `src/log.ts` with `phase(name, fn)`, `event(level, msg, payload?)`, and a `setVerbose(bool)` switch.
- [ ] 1.2 Logs go to stderr. Default level shows phase boundaries with timing and per-behavior progress; verbose adds full LLM I/O.
- [ ] 1.3 Wire `--verbose` flag and `SKILLET_VERBOSE=1` env var. CLI parses both; `setVerbose` is set early in `main()`.
- [ ] 1.4 Replace ad-hoc `console.log("...")` progress calls in `regen.ts`, `loop.ts`, and the import path with structured `phase`/`event` calls.

## 2. Per-behavior eval-gen with cheaper model

- [ ] 2.1 Add `evalGen` role to `resolveModels()` in `src/agent/provider.ts`. Default: judge model. Override via `SKILLET_EVAL_GEN_MODEL`.
- [ ] 2.2 Rewrite `src/authoring/prompts/eval-gen.ts` for single-behavior shape: input is one entry (with kind), output is a JSON array of 1+ cases for that one entry. Include the full spec must_not list with the "do not trip these" instruction.
- [ ] 2.3 Rewrite `src/authoring/phases/eval-gen.ts`:
  - Build the missing-entries list (already done — keep that).
  - For each missing entry, issue one LLM call via the eval-gen model.
  - Run with concurrency cap (default 6). Use `Promise.all` over a chunked queue or a small `pLimit`-like helper.
  - Validate per call. Retry that one entry up to 3 times on parse/validation failure.
  - Write each successful entry's file immediately (don't wait for the batch).
  - Return `{written, skipped, failed}`. `failed` is new.
  - Each step emits a `phase` and `event` log line.
- [ ] 2.4 Update `regen.ts` to handle `failed` from runEvalGen — log per-failure error, do not throw if at least one entry succeeded; throw only when all failed. The transactional layer (task 3) will handle rollback when needed.
- [ ] 2.5 Verify: run a synthetic 30-behavior spec and confirm parallel calls work, partial failure surfaces failed list, retries are isolated.

## 3. Transactional writes

- [ ] 3.1 Create `src/staging/index.ts` with:
  - `createStagingDir(skillRoot): { dir, swap, discard }` — returns a sibling temp dir and helpers.
  - `swap()` walks the staging dir, atomically renames each file into the live skill (per-file rename = atomic on POSIX), removes empty staging dir.
  - `discard()` removes the staging dir without touching the live skill.
- [ ] 3.2 Update `regen.ts` to write SKILL.md and eval files into the staging dir (not the live skill) and call `swap()` only after eval-gen reports global success.
- [ ] 3.3 Update `spec import` (`src/commands/spec.ts`): wrap the spec init + regen sequence in stage-and-swap. Spec.yaml writes also go to staging.
- [ ] 3.4 Update `improve` (`src/authoring/loop.ts`) for the import case: same wrapper. The improve loop's per-iteration prose tuning happens AFTER swap (operates on the live SKILL.md).
- [ ] 3.5 Update `create` (`src/commands/create.ts`): writes go through staging.
- [ ] 3.6 Update `add-eval` and `spec refine`: same wrapper.
- [ ] 3.7 Logging: `phase("staging")` logs the staging dir path; failure logs the path so the user can inspect what would have been written.
- [ ] 3.8 Verify: induce an eval-gen failure on a real-ish skill and confirm the live directory is unchanged.

## 4. frontmatter_extras

- [ ] 4.1 Add `frontmatter_extras?: Record<string, unknown>` to `SkillSpec` in `src/spec/types.ts`.
- [ ] 4.2 Update `src/spec/parser.ts`: parse the field opaquely (no value-type checking).
- [ ] 4.3 Update `src/spec/io.ts` (renderSpec): emit `frontmatter_extras` block when populated; preserve key order; round-trip stable.
- [ ] 4.4 Update `src/spec/structural.ts`: warn on conflicts (extras key matches a typed field name) but don't fail.
- [ ] 4.5 Update `src/authoring/phases/spec-import.ts`: capture all unknown frontmatter keys from the source SKILL.md into `frontmatter_extras` on the imported spec. Update the spec-import prompt to mention that the LLM doesn't need to handle these — skillet captures them mechanically before the LLM runs.
- [ ] 4.6 Actually: the spec-import prompt receives skillet's parsed frontmatter as JSON; the LLM doesn't see raw frontmatter text. So preservation is purely a parse step in the import command (`src/commands/spec.ts`) before spec-init runs. Implement in the command, not the prompt.
- [ ] 4.7 Update `src/authoring/phases/skill-gen.ts` and `src/authoring/prompts/skill-gen.ts`: render `frontmatter_extras` keys into the output frontmatter. Skill-gen prompt instructs the LLM to leave the frontmatter block alone; skillet renders it from the spec mechanically (existing pattern).
- [ ] 4.8 Verify: import warden/wrdn-pii fixture, confirm `allowed-tools` lands in spec.yaml and round-trips through `skillet improve`.

## 5. Default tools on create

- [ ] 5.1 CLI: parse `--tools "<list>"` and `--no-default-tools` for `skillet create`.
- [ ] 5.2 `src/commands/create.ts`: when neither flag is set, populate `spec.frontmatter_extras["allowed-tools"]` with the default `"Read Grep Glob Bash Edit Write"` before regen runs.
- [ ] 5.3 With `--tools "..."`: use the user's value verbatim.
- [ ] 5.4 With `--no-default-tools`: skip populating the key.
- [ ] 5.5 Update `src/authoring/prompts/spec-init.ts`: note that allowed-tools is populated by skillet, not the LLM.
- [ ] 5.6 Verify: `skillet create "test"` produces a SKILL.md with the expected `allowed-tools` line.

## 6. must_not awareness in eval-gen

- [ ] 6.1 Update `src/authoring/prompts/eval-gen.ts` (already touched in task 2.2): add a section "Do not construct fixtures that trip these rules" listing the spec's full must_not statements.
- [ ] 6.2 The single-behavior call sees the full must_not list regardless of which entry it's generating for.
- [ ] 6.3 Verify: a privacy-style fixture skill no longer produces fictional names that match its own redaction rules.

## 7. Build, integration, docs

- [ ] 7.1 Type-check passes (`tsc --noEmit`).
- [ ] 7.2 Build succeeds (`npm run build`).
- [ ] 7.3 `skillet verify` and `skillet eval` regressions pass on existing fixtures.
- [ ] 7.4 End-to-end smoke: `skillet improve` on a 12-behavior fixture completes faster than today (proves parallelism wins); `skillet improve` on a synthetic 30+ behavior fixture completes without the JSON-malformation failure (proves per-call works).
- [ ] 7.5 README + skillet-skill SKILL.md updated to mention `--verbose`, `--tools`, `--no-default-tools`, `SKILLET_VERBOSE`, `SKILLET_EVAL_GEN_MODEL`.
- [ ] 7.6 Update `skills/skillet/spec.yaml` if any new behaviors are warranted (e.g. "explain that allowed-tools survives import").
