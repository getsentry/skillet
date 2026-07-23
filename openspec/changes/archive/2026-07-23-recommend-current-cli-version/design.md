# Design

## Update Notification

Mirror dotagents' update-notifier boundary:

- Start the registry request only after a valid command is selected.
- Read `https://registry.npmjs.org/@sentry/skillet/latest` with a three-second timeout.
- Cache the last successful result in `~/.skillet/update-check.json` for 24 hours.
- Await the already-running check after the command, then write any recommendation to stderr so JSON stdout remains unchanged.
- Silently ignore network, parsing, and cache failures.

Help and version commands do not check because they should remain instant and side-effect free.

## Current-Version Invocation

The authoring skill uses a package runner rather than a bare executable for every Skillet command. npm environments use `npx -y @sentry/skillet@latest`; pnpm environments may use `pnpx @sentry/skillet@latest`. The explicit `@latest` tag makes version resolution intentional instead of relying on an existing global binary or an ambiguous cached package request.

Human documentation may still describe the `skillet` binary as the command surface, but setup and agent-facing examples lead with the package-runner form.
