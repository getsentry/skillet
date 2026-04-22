## 1. Normalized result types and JSON output

- [ ] 1.1 Define normalized result types (`NormalizedMessage`, `NormalizedSession`, `UsageSummary`, `EvalCaseResult`) in a new `src/eval/types.ts` — shaped toward vitest-evals compatibility
- [ ] 1.2 Update `src/eval/runner.ts` to populate normalized results (session transcript, usage metadata) during eval execution
- [ ] 1.3 Update `src/agent/loop.ts` to return conversation messages alongside output text and tool call count
- [ ] 1.4 Create `src/output/json.ts` with JSON serializer for eval results
- [ ] 1.5 Extract existing ANSI output from `src/commands/eval.ts` into `src/output/pretty.ts`
- [ ] 1.6 Add `--json` flag to `src/commands/eval.ts` that switches between pretty and JSON output
- [ ] 1.7 Verify: `skillkit eval --json` produces valid JSON with session, usage, checks, judge, errors fields

## 2. Structural validation

- [ ] 2.1 Create `src/skill/validator.ts` with functions to validate SKILL.md frontmatter (required fields: name, description) and eval file structure
- [ ] 2.2 Create `src/commands/validate.ts` that finds skill root, runs validator, reports results
- [ ] 2.3 Add `--json` flag to validate command for structured error output
- [ ] 2.4 Wire `validate` into `src/cli.ts` command dispatch
- [ ] 2.5 Verify: `skillkit validate` catches missing frontmatter, missing fields, malformed eval YAML

## 3. CLI command surface update

- [ ] 3.1 Update `src/cli.ts` to dispatch `create`, `improve`, `eval`, `validate` commands and remove `iterate` stub
- [ ] 3.2 Create `src/commands/create.ts` stub that parses description argument and `--path`/`--max-iterations` flags
- [ ] 3.3 Create `src/commands/improve.ts` stub that parses path argument and `--max-iterations` flag
- [ ] 3.4 Both `create` and `improve` call shared `authorSkill()` with appropriate mode
- [ ] 3.5 Update `--help` output to reflect new command surface
- [ ] 3.6 Verify: `create` errors if SKILL.md exists, `improve` errors if SKILL.md missing

## 4. Bundled skill-writer references

- [ ] 4.1 Create `references/` directory in project root with skill-patterns.md, authoring-guidance.md, eval-examples.md
- [ ] 4.2 Populate reference files with distilled skill-writer knowledge (patterns, quality bars, eval case patterns)
- [ ] 4.3 Add `references` to `files` array in package.json so they ship with the npm package
- [ ] 4.4 Create `src/authoring/references.ts` with functions to load reference files at runtime
- [ ] 4.5 Verify: references load correctly when running from both source and installed package

## 5. Authoring loop core

- [ ] 5.1 Create `src/authoring/loop.ts` with `authorSkill()` orchestrator function accepting mode (`create`|`improve`), description, path, and iteration config
- [ ] 5.2 Create `src/authoring/prompts.ts` with system prompt builders for each phase (skill generation, eval generation, assessment)
- [ ] 5.3 Create `src/authoring/eval-gen.ts` with LLM-driven eval case generation from SKILL.md content
- [ ] 5.4 Implement skill generation phase: LLM call with description + reference material → SKILL.md
- [ ] 5.5 Implement eval generation phase: LLM call with SKILL.md + eval examples → eval YAML files
- [ ] 5.6 Implement eval execution phase: call existing `runEvals()` and collect results
- [ ] 5.7 Implement assessment phase: LLM call with eval results + SKILL.md → improvement suggestions
- [ ] 5.8 Implement iteration loop: repeat phases 5.4–5.7 up to max iterations, stop early on all-pass
- [ ] 5.9 Wire `authorSkill()` into `create` and `improve` commands
- [ ] 5.10 Verify: `skillkit create "simple greeting skill"` produces a working SKILL.md with passing evals

## 6. Extractable eval engine boundary

- [ ] 6.1 Create `src/eval/index.ts` as the single public entry point — re-exports `runEvals`, result types, and parser utilities only
- [ ] 6.2 Ensure nothing outside `src/eval/` imports internal eval modules (checks, judge, workspace, requirements) directly — all access goes through the boundary
- [ ] 6.3 Create `evals/` directory at project root for skillkit's own dogfood eval cases
- [ ] 6.4 Write eval cases for `skillkit eval` itself: given a known skill + eval fixture, verify structured JSON output shape, check/judge results, and exit codes
- [ ] 6.5 Write eval cases for `skillkit validate`: given valid/invalid SKILL.md fixtures, verify correct pass/fail and error messages
- [ ] 6.6 Write eval cases for `skillkit create` (LLM-as-judge): given a description, judge whether the produced SKILL.md meets skill-writer quality bars
- [ ] 6.7 Run skillkit's own evals via `skillkit eval` (full dogfood loop) and verify they pass

## 7. Update existing specs

- [ ] 7.1 Archive old specs and apply new/modified specs to `openspec/specs/` using `openspec archive`
