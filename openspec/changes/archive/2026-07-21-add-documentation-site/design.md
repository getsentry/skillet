# Design

## Site Architecture

The documentation site is a static Astro Starlight application under `docs/`. It uses the shared Sentry Starlight theme, monochrome code highlighting, and generated Markdown routes for agent clients.

The docs project has its own `package.json` and `package-lock.json`. This avoids adding website dependencies or workspace behavior to the publishable root npm package and lets Vercel use `docs/` as its project root later.

## Content Ownership

- `README.md` remains the short GitHub and npm entry point.
- The site becomes the detailed user documentation.
- `LIFECYCLE.md` remains the implementation-oriented repository reference until its useful contributor content is deliberately moved or retired.
- CLI help remains authoritative for flags; reference pages explain workflows and link users to `skillet <command> --help` for exhaustive options.

## Deployment Boundary

The repository includes `docs/vercel.json` with a static Astro build and Markdown content negotiation for the root page. Vercel project creation, authentication, domains, and production access are deferred until credentials and project settings are provided.

## Non-Goals

- Create a Vercel project or configure deployment protection.
- Add analytics, search services, or a backend.
- Add Skillet to the Sentry Labs portal.
- Generate documentation from TypeScript source during the initial setup.
