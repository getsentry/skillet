# Changelog

## 0.26.0

### New Features ✨

#### Authoring

- Wire spec-author to read-only agentic tool loop by @gricha in [7f07a506](https://github.com/getsentry/skillet/commit/7f07a506a5abe37fc593af714235192ac5c78a9d)
- Plan-driven spec-author loop with resumable sessions by @gricha in [3575be15](https://github.com/getsentry/skillet/commit/3575be15c52a49a353b6abf6f00de4249d7389aa)

#### Other

- (agent) Add research scope with executor wrapper by @gricha in [a4632648](https://github.com/getsentry/skillet/commit/a4632648a21eb5d909fef3fbb0449ab61ba408e0)
- (cli) Add --input flag and session inputPaths by @gricha in [768729ab](https://github.com/getsentry/skillet/commit/768729abc1b8df60c2d82aa346c0e85d351a35e2)
- Improve skill depth and eval reliability by @gricha in [536f61ad](https://github.com/getsentry/skillet/commit/536f61adb86ff1d939eed392b05ddfe2c4337b54)

### Internal Changes 🔧

- (agent) Extract reusable tool-loop kernel from runAgent by @gricha in [4f6914cc](https://github.com/getsentry/skillet/commit/4f6914cc15c4d9051ddf457cc8ce4f81238f286d)
- Simplify agentic spec-author scaffolding by @gricha in [eaa10288](https://github.com/getsentry/skillet/commit/eaa102885d5c95ad406c2a69da20b8a0f6157625)

## 0.25.0

- No documented changes.

## 0.24.1

### New Features ✨

- (authoring) Per-behavior eval-gen + structured logger by @gricha in [f7790eca](https://github.com/getsentry/skillet/commit/f7790eca66bd1c39c4d8869cf94bd047f1db03cd)
- (spec) Frontmatter_extras + default tools on create by @gricha in [066392b1](https://github.com/getsentry/skillet/commit/066392b1a69c6e45237f94c01acfadcd1d29ea1b)
- (staging) Transactional writes — failure leaves originals intact by @gricha in [d9100a32](https://github.com/getsentry/skillet/commit/d9100a32efc58494935987dc0f9db8d05a52061c)

### Documentation 📚

- (openspec) Archive resilience-and-fidelity change by @gricha in [a15096d5](https://github.com/getsentry/skillet/commit/a15096d5cf0f78a01cdcbfe88a57cf7ea9b9c3cc)

### Internal Changes 🔧

- (authoring) Share retry harness, normalize, prompt fragments by @gricha in [74b10312](https://github.com/getsentry/skillet/commit/74b103129b4ed57ef26b6057452bcf42504af159)

## 0.24.0

### New Features ✨

- (eval) Skillet compare for skill-to-skill head-to-head by @gricha in [d82deba8](https://github.com/getsentry/skillet/commit/d82deba8d457aa3c8d32ef4e033706cce6339a86)

## 0.23.0

### New Features ✨

- (eval) --against flag for skill-to-skill comparison by @gricha in [ef42db1b](https://github.com/getsentry/skillet/commit/ef42db1b4f21078b86971e72e1914e636c11e67e)

## 0.22.0

### New Features ✨

- (harness) Capture workspace artifacts for the judge by @gricha in [b607e11a](https://github.com/getsentry/skillet/commit/b607e11ae9042603eb024289290451622f6e5c2a)

## 0.21.0

### Internal Changes 🔧

- (prompts) Code-example rubric for skill-gen by @gricha in [35970d14](https://github.com/getsentry/skillet/commit/35970d141562c659058fc02ababd9fb6bbde3d81)

## 0.20.0

### New Features ✨

- (evals) One file per behavior; preserve user edits on regen by @gricha in [e65de94d](https://github.com/getsentry/skillet/commit/e65de94d036660de85074cf5c4acaf5ebb25c943)

## 0.19.0

### New Features ✨

- (evals) Concurrent test execution + live progress by @gricha in [1ab166e6](https://github.com/getsentry/skillet/commit/1ab166e6d66b33ca7cfc7b3acd9c76480f21b835)

## 0.18.0

### Bug Fixes 🐛

- (evals) Vitest runner config — set root + alias for external skills by @gricha in [7048380c](https://github.com/getsentry/skillet/commit/7048380c30c3e3b61a8e0261ec2b8a94af7811fd)

### Documentation 📚

- (openspec) Archive vitest-evals-migration change by @gricha in [dfed1bf2](https://github.com/getsentry/skillet/commit/dfed1bf287febae32cab7159433e60e181a9973f)

## 0.17.0

### New Features ✨

#### Evals

- Vitest delegation + TypeScript eval generation by @gricha in [55f96ae0](https://github.com/getsentry/skillet/commit/55f96ae0fa74dd76888493185ede8aa5f873dfad)
- Local vitest-evals mini-lib + skillet harness by @gricha in [443bf3dd](https://github.com/getsentry/skillet/commit/443bf3dd83af699d4aca02317733710af391b7a4)

### Internal Changes 🔧

- (evals) Convert remaining fixtures to .eval.ts; update README by @gricha in [31111ef4](https://github.com/getsentry/skillet/commit/31111ef4c9f4fc6385851f6969154b7322b14ed1)
- (skillet-skill) Update spec/SKILL.md for the new eval format by @gricha in [be82987e](https://github.com/getsentry/skillet/commit/be82987e5520abb4343db5da65b8e1cc060958e9)
- (spec) Drop eval blocks from spec; spec is intent only by @gricha in [7b049a78](https://github.com/getsentry/skillet/commit/7b049a7853294a92d28a51531fabcca23b02e574)

## 0.16.0

### New Features ✨

- (verify) Add trigger quality verification layer (--triggers) by @gricha in [ed11c5af](https://github.com/getsentry/skillet/commit/ed11c5af825b2837566b855ddae30e9fdfa6fe9d)

### Internal Changes 🔧

- Remove dead weight — assess phase, spec-format, class field, duplication by @gricha in [71646a6d](https://github.com/getsentry/skillet/commit/71646a6da0b0f7aed4cedde63c67b59e2775ef07)

## 0.15.0

### New Features ✨

- (authoring) Improve becomes spec-read-only; promote passing evals by @gricha in [c8cbbca5](https://github.com/getsentry/skillet/commit/c8cbbca5294f8955360dc5964b26a87a3efe30be)

### Bug Fixes 🐛

- (authoring) Surface coverage gaps after spec mutations; tighten dedupe precision by @gricha in [66c3a254](https://github.com/getsentry/skillet/commit/66c3a25465aba0194afe2cad99715ee82dd73bcf)
- (provider) Distinguish transient discovery failures, retry once by @gricha in [914c7183](https://github.com/getsentry/skillet/commit/914c71837018c82fcf906352acae793e934591fa)

## 0.14.0

### Bug Fixes 🐛

- (agent) Enforce case-level timeout, retry on mid-stream errors by @gricha in [3daaa4ca](https://github.com/getsentry/skillet/commit/3daaa4cac32093fc6ca00201e51e11ed8017eac7)

## 0.13.0

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
