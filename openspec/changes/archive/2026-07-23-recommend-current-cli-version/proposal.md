# Recommend the Current CLI Version

## Why

The installed `skillet-authoring` skill can outlive a globally installed Skillet CLI. Because the CLI serves the current artifact formats and writing instructions, an old binary can make an otherwise current skill follow stale guidance without telling the user.

## What Changes

- Check npm for a newer Skillet release in the background when a real command runs, cache the result for 24 hours, and recommend the current package-runner command after the command completes.
- Keep update checks best-effort: help, version output, offline use, and command success never depend on the registry.
- Make `npx -y @sentry/skillet@latest` the canonical authoring-skill invocation, with `pnpx @sentry/skillet@latest` as the pnpm equivalent.
- Update install and authoring documentation so global installation is optional rather than the path agents are taught to prefer.

## Impact

The first real command after a stale cache may make one short request to the npm registry. Skillet still makes no LLM calls, stores no credentials, and remains fully functional when the check fails.
