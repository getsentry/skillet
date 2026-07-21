# Documentation Site Specification

## ADDED Requirements

### Requirement: Shared Sentry documentation stack

Skillet SHALL provide a static documentation site under `docs/` built with Astro Starlight and `@sentry/starlight-theme`. Documentation dependencies SHALL remain isolated from the published root npm package.

#### Scenario: Local documentation install

- **WHEN** a contributor runs `npm ci` inside `docs/`
- **THEN** the documentation dependencies install from `docs/package-lock.json` without changing the root package dependencies

#### Scenario: Static build

- **WHEN** a contributor runs the documentation build
- **THEN** Astro writes a static site to `docs/dist/` without requiring a backend or runtime environment variables

### Requirement: Structured user documentation

The site SHALL provide a concise landing page and navigable documentation for installation, the first-skill workflow, artifacts, specifications, eval cases, baseline lift, harnesses, sandboxing, CLI commands, eval YAML, and `.skillet.yaml` configuration.

#### Scenario: New user starts from the site

- **WHEN** a user opens the documentation homepage
- **THEN** they can install Skillet, install the authoring skill, and reach a first successful skill workflow without reading repository internals

#### Scenario: Existing user needs reference material

- **WHEN** a user needs the eval case schema or harness configuration
- **THEN** the sidebar exposes a dedicated reference page for that contract

### Requirement: Agent-readable documentation

The site SHALL publish Markdown versions of documentation pages for coding agents and provide an `llms.txt` entry point.

#### Scenario: Agent requests Markdown

- **WHEN** an agent client requests a generated `.md` documentation route
- **THEN** it receives the page content as Markdown with navigation metadata

### Requirement: Deployment-ready static configuration

The docs project SHALL include Vercel configuration for a static Astro build while leaving project creation, authentication, and domain configuration external to the repository.

#### Scenario: Vercel project is connected later

- **WHEN** Vercel uses `docs/` as the project root
- **THEN** it can install with npm, build the site, and serve `dist/` using repository configuration

### Requirement: Documentation validation

CI SHALL install the documentation project independently and run Astro validation and a production build.

#### Scenario: Invalid documentation change

- **WHEN** a documentation change introduces an Astro type error or broken production build
- **THEN** the repository CI workflow fails before merge
