## 1. Core workflow

- [x] 1.1 Change `skillet new` to scaffold only `spec.md`, update its JSON/human output, and add regression coverage.
- [x] 1.2 End the required `skillet status` ladder at a current SKILL.md while reporting eval cases as optional, with tests for skills with and without cases.
- [x] 1.3 Remove missing-behavior eval diagnostics while preserving optional-case reference and fixture validation, with unit and command-output coverage.
- [x] 1.4 Update CLI, package, instruction, and show copy so eval coverage is descriptive and opt-in.

## 2. Authoring contract

- [x] 2.1 Update the skillet-authoring `spec.md` so ordinary authoring completes without eval generation or execution and explicit eval requests retain the existing quality rules.
- [x] 2.2 Re-render skillet-authoring `SKILL.md` from the updated spec with the current hash and adapt its dogfood cases to the opt-in behavior.
- [x] 2.3 Build and dogfood the authoring artifacts with current CLI status, instructions, validation, and dry-eval checks.

## 3. Documentation

- [x] 3.1 Update README, CHANGELOG, LIFECYCLE, and lifecycle policy to define the core spec-to-skill path and optional eval branch.
- [x] 3.2 Update the documentation landing page, tutorials, concepts, guides, and CLI reference to make evaluation an explicit choice.
- [x] 3.3 Refresh agent-readable generated documentation and verify the documentation site.

## 4. Verification

- [x] 4.1 Run focused tests, `npm run check`, `npm run docs:check`, and `npm run build`.
- [x] 4.2 Run `npx openspec validate make-evals-opt-in --strict` and confirm the implementation matches every delta scenario.
