# Fix Existing Skill Onboarding

## Why

Existing skills often contain `SKILL.md` plus an uppercase `SPEC.md` that is not a Skillet behavior spec. On case-insensitive filesystems, Skillet currently mistakes `SPEC.md` for lowercase `spec.md`, parses the wrong grammar, marks `SKILL.md` stale, and reports coverage as `ok` with zero known behaviors. On case-sensitive filesystems, the same directory is treated as missing `spec.md`, producing different guidance.

## What Changes

- Detect required artifact names with exact case on every filesystem.
- Treat uppercase `SPEC.md` as an explicit legacy marker, not the active Skillet contract.
- Direct existing skills to preserve or rename the legacy file, derive lowercase `spec.md`, then add eval coverage.
- Report eval case schema results separately from behavior coverage.
- Mark coverage as not checked when `spec.md` is missing or structurally invalid.
- Expose an additive `coverageChecked` field in `validate --json`.

## Impact

The human and JSON status output gain an uppercase-SPEC legacy marker. Validation output becomes more explicit for incomplete migrations. Valid Skillet skills and case schema validation remain unchanged.
