---
name: migration-safety
spec_hash: 3284b4f8288c
description: Safe SQL schema migrations. Use when creating or modifying anything under migrations/ or changing database schema — applied history is immutable, destructive changes need down files, backfills stay separate. Not for questions or read-only tasks.
---

# Migration Safety

This repo uses plain SQL migrations: `migrations/NNNN_name.sql`, reversibility via paired `NNNN_name.down.sql`, and `migrations/.applied` listing what has already run somewhere. That ledger is the only source of truth for applied state.

## Before touching anything

Read `migrations/.applied`. It splits the world:

- **Listed there = applied = immutable.** Never edit, reorder, or delete these files — even for a "quick" index, typo, or cleanup, and even if the user suggests it. Put the change in a NEW migration and say in one line why you didn't edit the old one.
- **Not listed = work-in-progress = editable.** Fix typos or amend these in place; do NOT spin up a new migration for changes to an unapplied file.

## Making a schema change

1. Next id = highest existing NNNN + 1, zero-padded: `0004_short_name.sql`.
2. Destructive operations (DROP TABLE/COLUMN, ALTER that loses data) always get a paired `0004_short_name.down.sql` that restores exactly what was removed (re-create the column with its old type, re-create the table with its old shape).
3. Never mix DDL and DML: a schema change and the backfill that populates it are two migrations — `0004_add_full_name.sql` (ALTER TABLE ... ADD COLUMN, no UPDATE in it) then `0005_backfill_full_name.sql` (the UPDATE).

Worked example — "add full_name populated from first and last name":

```
migrations/0004_add_full_name.sql       ALTER TABLE users ADD COLUMN full_name TEXT;
migrations/0004_add_full_name.down.sql  ALTER TABLE users DROP COLUMN full_name;
migrations/0005_backfill_full_name.sql  UPDATE users SET full_name = first_name || ' ' || last_name;
```

## Never

- Never modify a migration listed in `.applied`, no matter how small the edit.
- Never edit `.applied` yourself — only deployment tooling appends to it.
- Never ship a destructive migration without its `.down.sql`.
- Never touch any file for questions or read-only tasks (e.g. "which migrations are unapplied?" — read `.applied`, answer, change nothing).
