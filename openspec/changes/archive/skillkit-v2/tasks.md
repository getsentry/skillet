## 1. Normalized result types and JSON output

- [x] 1.1 Define normalized result types (`NormalizedMessage`, `NormalizedSession`, `UsageSummary`, `EvalCaseResult`) in a new `src/eval/types.ts` — shaped toward vitest-evals compatibility
- [x] 1.2 Update `src/eval/runner.ts` to populate normalized results (session transcript, usage metadata) during eval execution
- [x] 1.3 Update `src/agent/loop.ts` to return conversation messages alongside output text and tool call count
- [x] 1.4 Create `src/output/json.ts` with JSON serializer for eval results
- [x] 1.5 Extract existing ANSI output from `src/commands/eval.ts` into `src/output/pretty.ts`
- [x] 1.6 Add `--json` flag to `src/commands/eval.ts` that switches between pretty and JSON output
- [x] 1.7 Verify: `skillkit eval --json` produces valid JSON with session, usage, checks, judge, errors fields

## 2. Structural validation

- [x] 2.1 Create `src/skill/validator.ts` with functions to validate SKILL.md frontmatter (required fields: name, description) and eval file structure
- [x] 2.2 Create `src/commands/validate.ts` that finds skill root, runs validator, reports results
- [x] 2.3 Add `--json` flag to validate command for structured error output
- [x] 2.4 Wire `validate` into `src/cli.ts` command dispatch
- [x] 2.5 Verify: `skillkit validate` catches missing frontmatter, missing fields, malformed eval YAML

## 3. CLI command surface update

- [x] 3.1 Update `src/cli.ts` to dispatch `create`, `improve`, `eval`, `validate` commands and remove `iterate` stub
- [x] 3.2 Create `src/commands/create.ts` stub that parses description argument and `--path`/`--max-iterations` flags
- [x] 3.3 Create `src/commands/improve.ts` stub that parses path argument and `--max-iterations` flag
- [x] 3.4 Both `create` and `improve` call shared `authorSkill()` with appropriate mode
- [x] 3.5 Update `--help` output to reflect new command surface
- [x] 3.6 Verify: `create` errors if SKILL.md exists, `improve` errors if SKILL.md missing

## 4. Bundled skill-writer references

- [x] 4.1 Create `references/` directory in project root with skill-patterns.md, authoring-guidance.md, eval-examples.md
- [x] 4.2 Populate reference files with distilled skill-writer knowledge (patterns, quality bars, eval case patterns)
- [x] 4.3 Add `references` to `files` array in package.json so they ship with the npm package
- [x] 4.4 Create `src/authoring/references.ts` with functions to load reference files at runtime
- [x] 4.5 Verify: references load correctly when running from both source and installed package

## 5. Authoring loop core

- [x] 5.1 Create `src/authoring/loop.ts` with `authorSkill()` orchestrator function accepting mode (`create`|`improve`), description, path, and iteration config
- [x] 5.2 Create `src/authoring/prompts.ts` with system prompt builders for each phase (skill generation, eval generation, assessment)
- [x] 5.3 Create `src/authoring/eval-gen.ts` with LLM-driven eval case generation from SKILL.md content
- [x] 5.4 Implement skill generation phase: LLM call with description + reference material → SKILL.md
- [x] 5.5 Implement eval generation phase: LLM call with SKILL.md + eval examples → eval YAML files
- [x] 5.6 Implement eval execution phase: call existing `runEvals()` and collect results
- [x] 5.7 Implement assessment phase: LLM call with eval results + SKILL.md → improvement suggestions
- [x] 5.8 Implement iteration loop: repeat phases 5.4–5.7 up to max iterations, stop early on all-pass
- [x] 5.9 Wire `authorSkill()` into `create` and `improve` commands
- [ ] 5.10 Verify: `skillet create "simple greeting skill"` produces a working SKILL.md with passing evals

## 6. Extractable eval engine boundary

- [x] 6.1 Create `src/eval/index.ts` as the single public entry point — re-exports `runEvals`, result types, and parser utilities only
- [x] 6.2 Ensure nothing outside `src/eval/` imports internal eval modules (checks, judge, workspace, requirements) directly — all access goes through the boundary
- [x] 6.3 Create `evals/` directory at project root for skillet's own dogfood eval cases
- [x] 6.4 Write eval cases for `skillet eval` itself: given a known skill + eval fixture, verify structured JSON output shape, check/judge results, and exit codes
- [x] 6.5 Write eval cases for `skillet validate`: given valid/invalid SKILL.md fixtures, verify correct pass/fail and error messages
- [ ] 6.6 Write eval cases for `skillet create` (LLM-as-judge): given a description, judge whether the produced SKILL.md meets skill-writer quality bars
- [ ] 6.7 Run skillet's own evals via `skillet eval` (full dogfood loop) and verify they pass

## 7. Update existing specs

- [x] 7.1 Archive old specs and apply new/modified specs to `openspec/specs/` using `openspec archive`
