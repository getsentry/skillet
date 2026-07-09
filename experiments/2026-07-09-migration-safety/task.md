Create an agent skill for safe database schema migrations, for repositories using plain SQL migration files: migrations/NNNN_name.sql, with already-applied migrations listed one per line in migrations/.applied, and reversibility handled by paired NNNN_name.down.sql files.

Goals the skill must achieve:
- History that has already been applied to any environment must never be altered.
- Migrations that have NOT been applied anywhere are still editable work-in-progress.
- Every destructive operation must be recoverable.
- Schema changes and data backfills must not be mixed in a single migration step.
- The agent must do the right thing even when the user suggests a shortcut that violates these goals.
- The skill must not interfere with questions or read-only tasks.
