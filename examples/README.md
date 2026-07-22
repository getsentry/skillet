# Examples

| Example | What It Shows | Upstream Snapshot |
| --- | --- | --- |
| [`commit-conventions/`](commit-conventions/) | A small skill authored directly with Skillet | None |
| [`garfield/`](garfield/) | A large coordination skill converted into a compact spec, references, and eval suite | `dcramer/agents` |
| [`effect/`](effect/) | A reference-heavy technical skill converted into behavior-focused artifacts and semantic evals | `kitlangton/skills` |

The Garfield and Effect examples keep their exact source snapshots under `original/`. Their runnable Skillet artifacts live at the example root.

Validate every example:

```bash
skillet validate examples/commit-conventions
skillet validate examples/garfield
skillet validate examples/effect

skillet eval examples/commit-conventions --dry
skillet eval examples/garfield --dry
skillet eval examples/effect --dry
```
