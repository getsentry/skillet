# Depth and Reliability Improvements

## Motivation

Recent Warden skill tests showed that Skillet can now generate and run large
eval suites, but serious skills expose reliability and depth gaps:

- semantic verification fails on large specs because the judge must return one
  large JSON array;
- generated eval setup scripts can fail deterministically before the agent runs;
- staged regeneration can still mutate live files if seeded with hard links;
- tool-use evals cannot see actual tool calls even when the agent used tools;
- generated reference files are not useful in evals unless the harness exposes
  them and judges can see whether they were read;
- long investigation cases time out too easily;
- clean-room `create` produces a concise core skill, but not the deeper
  domain-expert structure that skill-writer can produce.

## Change

Improve the deterministic reliability path first, then raise the default
authoring depth for domain-expert/security-review skills.

## Goals

- Chunk semantic verification so large specs do not fail as one malformed JSON
  blob.
- Validate generated eval setup scripts before writing eval files.
- Preserve live skill files on failed staged regeneration.
- Surface tool-call records in normalized sessions for judges and eval tests.
- Include normalized transcripts and tool calls in criterion judge input.
- Expose skill `references/*.md` to eval agents as readable skill resources.
- Give eval cases enough wall-clock budget for agent work plus judge work.
- Update authoring guidance/prompts to generate deeper security-review specs
  with positive behaviors, false-positive traps, severity/output calibration,
  and conditional reference guidance.
- Add spec-driven reference artifacts so domain depth can live in
  `references/*.md` without bloating SKILL.md.

## Non-Goals

- Replace the current local vitest-evals compatibility layer.
