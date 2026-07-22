# Effect Example

This directory contains two versions of the Effect skill:

- `original/` is an exact snapshot of `kitlangton/skills/skills/effect` at the commit recorded in `UPSTREAM.md`.
- The files at this directory root are a Skillet-authored version with a behavior spec, compact agent instructions, references, and eval cases.

Validate the generated example:

```bash
skillet validate examples/effect
skillet eval examples/effect --dry
```
