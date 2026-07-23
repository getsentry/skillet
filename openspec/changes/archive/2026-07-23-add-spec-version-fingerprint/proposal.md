# Add a Spec Version Fingerprint

## Why

`spec.md` is the source for every derived skill artifact, but the file does not record which Skillet version supplied its grammar and authoring guidance. When formats evolve, reviewers cannot distinguish an old valid spec from one recently authored with current instructions.

## What Changes

- End newly scaffolded and newly authored specs with `<!-- skillet-version: <version> -->`.
- Populate the footer from the running Skillet package version in both `skillet new` and `skillet instructions spec`.
- Keep the footer outside the semantic grammar so older specs remain valid and parsing/API representations do not change.
- Teach the authoring skill to preserve or refresh the footer when it writes `spec.md`.

## Impact

Existing specs without a footer continue to validate. New and revised specs carry compact provenance that is visible in diffs and safe for Markdown renderers.
