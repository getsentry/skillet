# Add Documentation Site

## Why

Skillet's README explains the product, but the artifact lifecycle, eval model, harness configuration, and command reference are too dense for one repository page. Other Sentry Labs projects use small Astro Starlight sites with the shared Sentry theme, which gives Skillet a consistent documentation surface without adding an application backend.

## What Changes

- Add a standalone npm project under `docs/` using Astro Starlight and `@sentry/starlight-theme`.
- Add a concise landing page plus start, concept, guide, and reference sections.
- Generate agent-friendly Markdown routes with the shared theme plugin.
- Add local scripts and CI validation for the documentation build.
- Include static Vercel build configuration, but do not create or connect a Vercel project.

## Impact

The published CLI package and runtime behavior remain unchanged. Documentation dependencies and their lockfile stay isolated under `docs/`.
