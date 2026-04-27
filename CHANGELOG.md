# Changelog

## Unreleased

### Breaking Changes ⚠️

- **Spec-driven authoring**: Skills now have a `spec.yaml` source of
  truth that captures intent, behaviors, must-nots, and triggers in
  a structured form. SKILL.md and eval YAMLs are derived from the
  spec; hand edits to derived files get overwritten on regen.
- **`skillet validate` removed**: replaced by `skillet verify`, which
  runs four layers (structural, cross-artifact coverage, per-behavior
  results, optional semantic) and subsumes the per-file lint that
  `validate` used to do.
- **`add-eval` operates on the spec**: appends behaviors to
  `spec.yaml` and regenerates derived files instead of writing eval
  YAML directly. Auto-imports legacy SKILL.md-only skills.
- **`improve` auto-imports legacy skills**: when running against a
  directory with SKILL.md but no `spec.yaml`, the loop reverse-engineers
  a spec first (no separate migration step).

### New Features ✨

- `skillet spec init/show/refine/import` subcommand group for
  managing `spec.yaml`. Mutations auto-regenerate SKILL.md and evals.
- `skillet verify` command (replaces `validate`):
  - Layer 1: structural — files parse and have required fields
  - Layer 2: coverage — every behavior has an eval case; no orphans
  - Layer 3: results — per-behavior pass/fail when run data exists
  - Layer 4: `--semantic` — LLM-judged SKILL.md ↔ behavior coverage
- Iteration loop produces structured `SpecPatch[]` operations applied
  deterministically; converges on the spec rather than rewriting
  prose every iteration.
- New bundled reference `references/spec-format.md` documenting the
  `spec.yaml` schema for the spec-init / refine / import prompts.
- New `tests_behavior` field on eval cases for explicit linkage to
  spec entries; case names follow `<id>__<slug>` as a fallback.
- New self-test fixtures under `evals/fixtures/spec-driven-skill/` and
  `evals/fixtures/incomplete-spec-skill/` exercising verify's coverage
  layer.

## 0.12.0

### Bug Fixes 🐛

- Retry transient upstream errors; block output_not_contains echoes by @gricha in [301e2503](https://github.com/getsentry/skillet/commit/301e2503d87efe1238aea2403f5040c001d84cba)

## 0.11.0

### New Features ✨

- Retry on lint errors, pipe assessment to regen, scrub credential env by @gricha in [883059da](https://github.com/getsentry/skillet/commit/883059da29d483777eaa8e6ff7143c06cb596358)

## 0.10.0

### Bug Fixes 🐛

- (lint) Skip criteria-without-run on behavior cases; auto-fix POSIX regex by @gricha in [ba56099c](https://github.com/getsentry/skillet/commit/ba56099cf48aad27d82b43649dfc13c519607411)

## 0.9.0

### New Features ✨

- (eval-gen) Retry + hard-fail loop for load-bearing lint warnings by @gricha in [69c824f8](https://github.com/getsentry/skillet/commit/69c824f88eeed1ff9a22ad21bce5b1f6e085d52f)
- (prompts) Align skill-gen with skill-writer; make eval-gen push for real intent by @gricha in [07fd2b16](https://github.com/getsentry/skillet/commit/07fd2b162cb37b09342802aa315c81014d5d0991)

## 0.8.0

### New Features ✨

- (eval-gen) Require run: cat pairing for artifact-targeted criteria by @gricha in [dfc951b6](https://github.com/getsentry/skillet/commit/dfc951b61894cb6dc6d6ccbb08aa3206d0e2841d)
- (judge) Flag artifact-vs-transcript mismatch instead of falling back by @gricha in [00210639](https://github.com/getsentry/skillet/commit/002106396c83289523f5d200bd01ed136214603f)
- (lint) Warn when criteria present but no run: checks by @gricha in [9b3d4ca3](https://github.com/getsentry/skillet/commit/9b3d4ca3168fe7015abd13f108e822b041446d70)

## 0.7.0

### New Features ✨

#### Lint

- Pair-rule for negative file checks by @gricha in [0d36172d](https://github.com/getsentry/skillet/commit/0d36172d1d3605c5083fd2ea2fecd04bb60d0959)
- Nudge away from `chmod +x` stub patterns in setup by @gricha in [9e53ded1](https://github.com/getsentry/skillet/commit/9e53ded1f0e78440c299437b426cbbcccb4d98a5)
- Ban shared absolute paths and escalate export error by @gricha in [3be96ec5](https://github.com/getsentry/skillet/commit/3be96ec5cba575806f297f98f4b3d97a95e4affc)

#### Other

- (eval-gen) Add deliverable-classification rubric to gen prompt by @gricha in [16afd133](https://github.com/getsentry/skillet/commit/16afd13306e84db6aeabfd039dbdd343ee731692)
- (judge) Feed workspace artifacts to the LLM judge by @gricha in [20864610](https://github.com/getsentry/skillet/commit/20864610dc87d4ff24599b7d44cab276bef7ce66)

## 0.6.0

### New Features ✨

- (eval-gen) Teach generator runtime semantics and deliverable focus by @gricha in [fd7d505e](https://github.com/getsentry/skillet/commit/fd7d505ef792be317230fc17b71b1e0c18f7b57a)
- (lint) Warn on `export` in setup scripts by @gricha in [faac7009](https://github.com/getsentry/skillet/commit/faac70098f4c8910a2d7c76eb2049bf0d7cb4188)

### Bug Fixes 🐛

- (eval) Fail check when command exits non-zero without `exits` assertion by @gricha in [1fef9010](https://github.com/getsentry/skillet/commit/1fef9010b0ac115cb15a0cb7740bd5ad500a3dc6)

### Documentation 📚

- (evals) Explain fresh-process setup semantics by @gricha in [950cc974](https://github.com/getsentry/skillet/commit/950cc9741ca93f119e6e7e34a3575babf7ac8965)

## 0.5.0

- No documented changes.

## 0.4.0

### Bug Fixes 🐛

- (eval-gen) Use judge criteria for negative test cases by @gricha in [d70e037d](https://github.com/getsentry/skillet/commit/d70e037dbbecdd687538267e4d34d4aca7c5db02)

### Documentation 📚

- Add README and improve eval output (trace files, buffered progress) by @gricha in [481dae22](https://github.com/getsentry/skillet/commit/481dae225b3d674ac58719d693a855aba3be07ab)

## 0.3.0

### New Features ✨

- (skill) Add intent capture workflow for eval authoring by @gricha in [7fceee84](https://github.com/getsentry/skillet/commit/7fceee8491a2ea39531bae8340bfb4650cca552e)

### Bug Fixes 🐛

- (skill) Clean up wording, clarify skill-author use case by @gricha in [d5a62602](https://github.com/getsentry/skillet/commit/d5a626028db0d038fc1ad7c8d7f618d46e419365)

### Internal Changes 🔧

- (skill) Restructure skillet skill around eval-first workflow by @gricha in [9289abd9](https://github.com/getsentry/skillet/commit/9289abd9259e08ec8e12b9b40bef0391e778e484)

## 0.2.0

### New Features ✨

#### Eval

- Run eval cases in parallel by @gricha in [4b308bff](https://github.com/getsentry/skillet/commit/4b308bff7e7ce54cedb5bd3ff1a630684f39934a)
- Add eval YAML linter with auto-fix pipeline by @gricha in [748cf802](https://github.com/getsentry/skillet/commit/748cf802839e0080aaf6a9ff4521149b902f6b7a)
- Add live tool call progress output by @gricha in [b977a138](https://github.com/getsentry/skillet/commit/b977a13853e28191066b221b3e996b7849078aeb)

#### Other

- (authoring) Wire eval linter into generation pipeline by @gricha in [3888ff25](https://github.com/getsentry/skillet/commit/3888ff25af58475188126d54444ae8319d03ff5c)

### Bug Fixes 🐛

#### Eval

- Print tool call progress on newlines by @gricha in [1b85f5db](https://github.com/getsentry/skillet/commit/1b85f5db9764ad36072c2f4270a48763ffb3f779)
- Handle Python-style inline regex flags in checks by @gricha in [59173243](https://github.com/getsentry/skillet/commit/59173243c13cd4fafca83866f61c837874c0b39f)

#### Other

- (evals) Rewrite skillet skill evals as output-only checks by @gricha in [6c004607](https://github.com/getsentry/skillet/commit/6c00460776e6282b4f8671d059119a28fbd62010)

### Internal Changes 🔧

- (authoring) Improve progress logging and align with skill-creator by @gricha in [a9ca1ca1](https://github.com/getsentry/skillet/commit/a9ca1ca1198553c950c061422542d43ccbec67d5)
- Align skill creation with skill-writer quality standards by @gricha in [28c5f6a3](https://github.com/getsentry/skillet/commit/28c5f6a39008c6c0d3b0c551a91991bfbe119930)

