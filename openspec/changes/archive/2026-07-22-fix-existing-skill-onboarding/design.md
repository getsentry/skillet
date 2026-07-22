# Design

## Exact-Case Artifacts

Filesystem APIs such as `existsSync("spec.md")` can match `SPEC.md` on macOS. Skillet will inspect directory entry names and require exact `spec.md` and `SKILL.md` casing for active artifacts.

`SPEC.md` remains discoverable as migration evidence when `SKILL.md` identifies the skill root. It is never parsed as the active Skillet spec.

## Validation States

Eval case files can be schema-checked without a valid spec. Coverage cannot. The validation report therefore keeps separate states:

- eval cases: count plus schema issues
- coverage: checked only when a structurally valid `spec.md` parsed successfully

When coverage is unavailable, human output says so and JSON emits `coverageChecked: false`. An empty behavior list no longer implies that zero behaviors were validly covered.

## Migration Guidance

For `SKILL.md` plus uppercase `SPEC.md`, `status.next` tells the agent to preserve or rename the legacy document before creating lowercase `spec.md`, which is necessary on case-insensitive filesystems.

## Non-Goals

- Parse arbitrary legacy `SPEC.md` formats.
- Semantically verify that every spec behavior appears in `SKILL.md` prose.
- Generate the migrated spec inside the CLI.
