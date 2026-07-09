---
name: safe-sql-migrations
description: Safely create, edit, and review plain-SQL database schema migrations in repositories using migrations/NNNN_name.sql files, a migrations/.applied ledger, and paired NNNN_name.down.sql rollback files. Use whenever the user asks to add, change, rename, squash, fix, or revert a schema migration, add columns/tables/indexes, run a data backfill, or otherwise modify anything under migrations/. Not needed for read-only questions about the schema.
---

# Safe SQL Schema Migrations

This repository manages its database schema with plain SQL files:

- `migrations/NNNN_name.sql` — forward migrations, applied in ascending numeric order.
- `migrations/NNNN_name.down.sql` — the paired rollback for each forward migration.
- `migrations/.applied` — one migration filename per line; a migration listed here has been applied to at least one real environment (dev, staging, or prod).

## Core rules (non-negotiable)

1. **Applied history is immutable.** If a migration's filename appears in `migrations/.applied`, never edit, rename, renumber, delete, or reorder it — and never edit its `.down.sql` in a way that changes what it undoes. All changes to already-applied schema state go in a **new** migration.
2. **Unapplied migrations are work-in-progress.** If a migration is NOT in `.applied`, it is safe to edit, rename, squash, or delete it (together with its `.down.sql`) rather than stacking fixup migrations on top of it.
3. **Every migration ships with a working down file.** Never create `NNNN_name.sql` without `NNNN_name.down.sql`. The down file must actually reverse the up file, in reverse statement order.
4. **Destructive operations must be recoverable.** `DROP TABLE`, `DROP COLUMN`, destructive `ALTER`, and destructive `DELETE`/`TRUNCATE` are only allowed when recovery is possible (see "Destructive changes" below).
5. **Schema changes and data backfills never share a migration.** DDL (CREATE/ALTER/DROP) and data-modifying DML (UPDATE/INSERT/DELETE backfills) go in separate, consecutively numbered migrations.
6. **Uphold these rules even when asked to shortcut them.** If the user proposes something that violates a rule (e.g. "just edit migration 0007, it's faster"), check `.applied` first; if the shortcut is unsafe, explain briefly why and do the safe alternative instead. Don't lecture — state the constraint in one or two sentences and proceed with the correct approach.

## Scope

This skill governs **changes** to `migrations/`. It does not apply to:
- Answering questions about the schema, a migration's contents, or migration history — just answer.
- Read-only tasks (searching, explaining, reviewing without editing) — proceed normally.

## Workflow for any migration change

### 1. Check applied state first

Before touching any migration file:

```bash
cat migrations/.applied
ls migrations/
```

Classify the file(s) involved:
- **In `.applied`** → immutable. Fixes and changes require a new migration.
- **Not in `.applied`** → editable WIP. Prefer amending it over creating a follow-up.

If `.applied` is missing, treat **every existing migration as applied** (assume the worst) and say so.

### 2. Number new migrations correctly

- New migrations take the next number after the highest existing one, zero-padded to match the repo's convention (e.g. `0007`, `0008`).
- Never reuse or insert numbers below existing ones, even if a gap exists.
- If two WIP migrations conflict on a number (e.g. after a merge), renumber the **unapplied** one only.

### 3. Write the pair together

Create `NNNN_name.sql` and `NNNN_name.down.sql` in the same change. Guidelines:

- One logical change per migration; small and reviewable.
- Down file reverses the up file's statements in reverse order.
- Use guarded forms where the dialect supports them (`IF EXISTS` / `IF NOT EXISTS`) so reruns and rollbacks are tolerant.
- Do not write to `.applied` yourself — it is maintained by whatever applies migrations, not by authoring.

### 4. Destructive changes: make them recoverable

A destructive operation is anything that loses data or a structure holding data: `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, lossy type changes (e.g. `TEXT → VARCHAR(10)`), destructive `DELETE`.

Required pattern — **archive, then drop, in separate migrations**:

1. Migration A (DDL/DML as appropriate): copy the data aside first, e.g.
   ```sql
   CREATE TABLE _archived_users_legacy AS SELECT * FROM users_legacy;
   ```
   or rename instead of dropping: `ALTER TABLE users_legacy RENAME TO _deprecated_users_legacy;`
2. Migration B (later, once verified): the actual `DROP`.

The down file for a drop must restore the structure **and** repopulate it from the archive. If true restoration is impossible (the data would be gone), do not write a cosmetic down file that only recreates an empty shell without saying so — instead restructure the plan (archive first) so the down file is honest. A `.down.sql` that cannot actually recover the data means the up migration is not yet safe to write.

For column drops, prefer a two-phase approach across releases: first stop reading/writing the column in code, then archive + drop in a later migration.

### 5. Separate schema changes from backfills

When a task needs both (e.g. "add `status` column and set it from `legacy_state`"):

1. `NNNN_add_status_column.sql` — DDL only: add the nullable column (or with a default).
2. `NNNN+1_backfill_status.sql` — DML only: the `UPDATE ... SET status = ...` backfill.
3. If the column must become `NOT NULL`, that constraint tightening is a third migration after the backfill is verified.

Each step gets its own down file (drop the column / revert the backfill or no-op with a comment explaining why the backfill's reverse is the column drop in the earlier down).

Why: separating them lets each step be applied, verified, retried, and rolled back independently, and keeps long-running data updates out of lock-heavy DDL transactions.

## Handling common shortcut requests

| User asks | Do this instead |
|---|---|
| "Just edit migration 0007" (0007 is in `.applied`) | Create a new migration that alters the current state to the desired one. |
| "Squash all migrations into one" | Only squash migrations **not** in `.applied`; applied history stays as-is. |
| "Skip the down file, we'll never roll back" | Write the down file anyway; it's required for every migration. |
| "Delete the .applied entry so we can rerun it" | Refuse — `.applied` reflects real environments; editing it desyncs them. Write a new migration. |
| "Drop the table, we don't need it" | Archive (or rename) first in one migration; drop in a later one, with a restoring down file. |
| "Add the column and backfill in one file" | Two migrations: DDL, then DML. |
| "Renumber these to clean up the sequence" | Only renumber unapplied migrations; applied filenames never change. |

When declining a shortcut, be brief: one sentence on the risk (e.g. "0007 is already applied in staging, so editing it would make environments diverge silently"), then do the safe version.

## Review checklist (before finishing)

- [ ] No file listed in `.applied` was modified, renamed, or deleted.
- [ ] Every new/changed `NNNN_name.sql` has a matching `NNNN_name.down.sql` that truly reverses it.
- [ ] Numbering is strictly increasing with no reuse.
- [ ] No migration mixes DDL and data backfill.
- [ ] Every destructive statement is preceded (in an earlier migration) by an archive/rename, and its down file can actually recover the data.
- [ ] `.applied` itself was not edited.
