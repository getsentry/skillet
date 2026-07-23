# Improve Legacy Migration Fidelity

## Why

Skillet now detects legacy skill layouts and guides agents through the artifact order, but a migration can still pass structural validation after dropping exact runtime contracts such as enumerated review categories, output protocols, numeric thresholds, stop conditions, or long prompt templates. The existing authoring evals verify artifact preservation and coverage, not behavioral fidelity between the legacy sources and the derived Skillet artifacts.

The Garfield dogfood replay shows that a capable agent can preserve those details by independently auditing the old `SKILL.md`, `SPEC.md`, references, and maintenance docs. Skillet should make that preservation pass explicit so migration quality depends less on model initiative.

## What Changes

- Extend `skillet instructions spec` with a concise existing-skill preservation audit covering triggers, ordered workflow, exact enumerations, protocols and output formats, thresholds, stop and failure conditions, constraints, references, and supporting maintenance docs.
- Extend `skillet instructions skill` to treat exact legacy runtime rules as behavior rather than disposable implementation detail, move long protocols to linked references when needed, and reconcile removed rules before completing a render.
- Add a Skillet-authoring behavior and eval assertion that legacy migrations preserve concrete runtime contracts, not only files and structural validity.
- Update onboarding documentation to describe the preservation audit.

## Impact

The CLI remains deterministic and makes no LLM calls. No artifact grammar or command surface changes. New and existing skill authors receive a small amount of additional instruction text; legacy migrations gain a clearer quality bar and regression coverage.
