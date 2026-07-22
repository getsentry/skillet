# Garfield Example

This directory contains two versions of Garfield:

- `original/` is an exact snapshot of `dcramer/agents/skills/garfield` at the commit recorded in `UPSTREAM.md`.
- The files at this directory root are a Skillet-authored version with a behavior spec, compact agent instructions, references, and eval cases.

Validate the generated example:

```bash
skillet validate examples/garfield
skillet eval examples/garfield --dry
```
