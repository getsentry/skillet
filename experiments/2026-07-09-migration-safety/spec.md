# Migration Safety

## Intent

Make the agent treat SQL migration history as append-only where it is already applied, while keeping unapplied work editable. Agents (and users pushing shortcuts) routinely edit applied migrations in place, mix backfills into schema changes, and drop data without a way back — this skill encodes the discipline that prevents those failures in repositories using migrations/NNNN_name.sql with a migrations/.applied ledger and paired NNNN_name.down.sql files.

## Triggers

- **SHOULD** trigger when the agent creates or modifies anything under migrations/, or changes the database schema
- **SHOULD NOT** trigger for questions about migrations or other read-only tasks

## Behaviors

### Behavior: New changes get new migrations

For any schema change, the agent SHALL create a new migration file named with the next sequential four-digit id (e.g. 0004_short_name.sql) and SHALL leave every existing migration file byte-identical.

#### Scenario: Adding a column

- **WHEN** the user asks to add a column to an existing table
- **THEN** a new 0004_*.sql file contains the ALTER TABLE and files 0001-0003 are unchanged

### Behavior: Never edit applied migrations

The agent MUST NOT modify any migration listed in migrations/.applied, even when the user explicitly suggests editing one as a shortcut; it SHALL put the change in a new migration instead and briefly say why.

#### Scenario: User suggests editing an applied file

- **WHEN** the user asks to add an index directly into a migration listed in .applied
- **THEN** that file is untouched and a new migration contains the CREATE INDEX

### Behavior: Unapplied migrations may be edited

Migrations NOT listed in migrations/.applied are work-in-progress: when asked to fix or amend one, the agent SHALL edit it in place rather than creating a new migration.

#### Scenario: Typo fix in an unapplied migration

- **WHEN** the user asks to fix a typo in a migration absent from .applied
- **THEN** that file is edited in place and no new migration is created

### Behavior: Destructive changes are reversible

Every migration that drops or destructively alters schema SHALL ship with a matching NNNN_name.down.sql that restores what was removed.

#### Scenario: Dropping a column

- **WHEN** the user asks to drop a column
- **THEN** the new migration's paired .down.sql re-adds that column

### Behavior: Backfills separate from schema

The agent MUST NOT mix DDL (schema changes) and DML (data backfills) in one migration: the schema change and the UPDATE that populates it go in separate sequential migrations.

#### Scenario: Add-and-populate request

- **WHEN** the user asks to add a column and populate it from existing data
- **THEN** one new migration adds the column (no UPDATE in it) and a subsequent migration performs the backfill

### Behavior: Stay quiet on read-only tasks

For questions and read-only tasks the agent MUST NOT modify any file.

#### Scenario: Asking which migrations are unapplied

- **WHEN** the user asks which migrations have not been applied
- **THEN** the answer comes from reading .applied and no file changes

## Constraints

### Constraint: Ledger is the source of truth

The agent MUST NOT guess at applied state — applied means listed in migrations/.applied, nothing else — and MUST NOT edit .applied itself; only deployment tooling appends to it.
