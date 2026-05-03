## Tasks

- [ ] Install `vitest-evals@0.9.0-beta.0` (exact pin) and update
      `package.json` `exports["./evals"]`.
- [ ] Build `src/evals/` module: re-exports + `criterionJudge` +
      `withWorkspace` + `skilletHarness` adapter.
- [ ] Adapt `src/harness/index.ts` (or fold into `src/evals/`)
      to upstream `Harness<TInput, TMetadata>` shape; read
      `ctx.metadata.cwd`; drop `caseData.fixtureSlug`/`setup`.
- [ ] Reporter (`src/eval/vitest-runner.ts`,
      `src/eval/types.ts`): read `task.suite?.name`, drop
      `tests_behavior` meta path.
- [ ] Renderer (`src/authoring/phases/eval-gen-render.ts`):
      emit new shape. Update `_judges.ts` template.
- [ ] Prompts (`_code-eval-contract.ts`, `eval-gen.ts`,
      `eval-gen-verify.ts`): rewrite for new shape.
- [ ] `npm run check` green.
- [ ] Regenerate `skills/skillet/evals/` end-to-end and inspect.
- [ ] `dist/cli.js eval skills/skillet` passes through every case
      executing under the new pipeline.
- [ ] Delete `src/vitest-evals/`. Update `AGENTS.md`,
      `LIFECYCLE.md`.
- [ ] `npx openspec validate 2026-05-03-vitest-evals-upstream-migration --strict`.
- [ ] Commit + push to main.
