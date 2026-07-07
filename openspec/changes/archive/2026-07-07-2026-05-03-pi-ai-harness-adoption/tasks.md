## Tasks

- [ ] Install `@vitest-evals/harness-pi-ai@0.9.0-beta.0`.
- [ ] Build `src/evals/skillet-tools.ts`: convert existing
      `src/agent/tools.ts` defs to `PiAiToolset` shape;
      file-writing tools call `ctx.setArtifact(path, content)`.
- [ ] Build `src/evals/skillet-agent.ts`: `skilletAgent({ skillRoot })`
      returning `{ run(input, runtime) }`. Load skill + drive
      LLM loop, dispatching tool calls through `runtime.tools`.
- [ ] Decompose `runAgent` in `src/agent/loop.ts` — keep
      `runToolLoop` as the inner kernel; outer turn loop moves
      to `skilletAgent.run`.
- [ ] Update reporter / verify path to read tool calls from
      `result.session` instead of `AgentRunResult.toolCallCount`.
- [ ] Delete `src/harness/index.ts` `skilletHarness` export;
      update `src/evals.ts` barrel.
- [ ] Renderer emits `piAiHarness({ createAgent: () => skilletAgent({ skillRoot }), tools: skilletTools() })`.
- [ ] Generator + verifier prompts + `_code-eval-contract.ts`
      reflect new shape.
- [ ] `npm run check` clean.
- [ ] Regen `skills/skillet/evals/`; `dist/cli.js eval skills/skillet`
      passes end-to-end.
- [ ] Validate openspec strict.
- [ ] Commit + push.
