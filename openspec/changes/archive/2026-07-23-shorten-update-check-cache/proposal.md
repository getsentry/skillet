# Shorten the Update-Check Cache

## Why

Skillet's preferred agent path already uses an explicit `@latest` package runner. Unlike dotagents, Skillet is not primarily invoked repeatedly from CI workflows, so a 24-hour update cache can leave an installed binary recommending stale information for too long.

## What Changes

- Reduce update-check cache freshness from 24 hours to one hour.
- Keep the request concurrent with command work, time-bounded, and failure-silent.
- Retain the small home-directory cache to avoid repeated registry calls during one working session.

## Impact

An installed binary checks npm at most once per hour. `npx -y @sentry/skillet@latest`, help, version output, offline behavior, stdout, and exit codes are unchanged.
