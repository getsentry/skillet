---
title: Adopt an Existing Skill
description: Add a Skillet behavior spec and eval coverage to an existing SKILL.md.
type: tutorial
summary: Preserve legacy skill docs, derive lowercase spec.md, render the skill, and add behavior coverage.
---

Start with the existing skill directory:

```bash
skillet status path/to/skill
```

Skillet recognizes exact artifact names:

- lowercase `spec.md` is the active Skillet behavior contract
- uppercase `SPEC.md` is a legacy or project-specific document
- `SKILL.md` is the agent instruction file

An uppercase `SPEC.md` is useful migration input, but Skillet does not parse it as the active spec.

## Preserve the Existing Files

If the directory contains uppercase `SPEC.md`, preserve or rename it before creating lowercase `spec.md`:

```bash
mv SPEC.md legacy-SPEC.md
```

This rename is required on case-insensitive filesystems, which cannot keep `SPEC.md` and `spec.md` as separate files.

Do not overwrite the existing `SKILL.md`. Use it and the legacy document as source material for the new behavior contract.

## Ask Your Agent to Adopt the Skill

Give your coding agent this request:

> Adopt this existing skill into Skillet. Run `skillet status` first. Preserve the current `SKILL.md` and any legacy `SPEC.md`, derive a lowercase `spec.md` using `skillet instructions spec`, validate it, re-render `SKILL.md` with the current `spec_hash`, then add eval coverage for every behavior.

The authoring skill should follow the next step reported by the CLI instead of starting over.

## Validate in Stages

After writing `spec.md`:

```bash
skillet validate path/to/skill
```

At this point, missing eval cases become coverage warnings because Skillet now knows the behavior IDs.

Before lowercase `spec.md` exists, Skillet can still check `SKILL.md` frontmatter and any eval case YAML files, but it cannot check behavior coverage. The validation report shows:

```text
eval cases (0 files): ok
coverage: not checked (valid spec.md required)
```

An empty behavior list in JSON does not mean the skill has zero valid behaviors. Check `coverageChecked`:

```json
{
  "coverageChecked": false,
  "behaviorIds": [],
  "caseCount": 0
}
```

## Finish the Migration

```bash
skillet status path/to/skill
skillet validate path/to/skill
skillet eval path/to/skill --dry
```

The skill is structurally complete when:

- `spec.md` follows the Skillet grammar
- `SKILL.md` records the current `spec_hash`
- every spec behavior has at least one eval case
- the dry eval finds no case that passes without agent work, except deliberate no-action cases
