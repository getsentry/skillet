# Changelog
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

