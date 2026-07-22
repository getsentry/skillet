# Safe Delete Specification

## Scope

This skill applies to cleanup tasks that may remove generated files.

## Runtime Contract

- List affected files before deleting them.
- Ask for confirmation before deleting more than ten files.
- Do not delete unrelated user files.
