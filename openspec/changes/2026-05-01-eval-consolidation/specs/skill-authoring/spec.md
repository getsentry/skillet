# Skill Authoring — Cross-Behavior Consolidation Stage

## ADDED Requirements

### Requirement: Eval-gen runs a consolidation stage after all entries are planned

Eval-gen SHALL run a single deterministic consolidation stage
after all per-entry generate+verify pairs complete. The stage
dedupes judges across plans, extracts fixture trees to disk, and
produces the final per-entry rendered eval files. It SHALL be
in-process, LLM-free, and a pure function of the collected
`Array<{ entryId, plan }>` plus the target skill root.

#### Scenario: Consolidation runs once per skill regen
- **WHEN** `runEvalGen` regenerates 29 behaviors
- **THEN** the consolidation stage runs exactly once
- **AND** it executes after all 29 per-entry verify calls have
  resolved
- **AND** it does NOT issue LLM calls

#### Scenario: Consolidation drives all final writes
- **WHEN** the consolidation stage produces its result
- **THEN** `evals/_judges.ts` is written from
  `result.judges`
- **AND** every entry under `result.fixtures` is written under
  `evals/fixtures/<slug>/...`
- **AND** every per-entry `.eval.ts` is rendered from
  `result.perEntry` using `result.judges` for imports

### Requirement: Judge dedup by exact name

Consolidation SHALL dedupe judges by exact name match across the
collected per-entry plans. The first encountered criterion for a
given name SHALL be the canonical criterion. When two plans
declare the same judge name with different criteria,
consolidation SHALL emit a `warn` event naming the involved
entries and both criteria, and proceed using the first.

The first-criterion-wins rule keeps consolidation deterministic
without an LLM and without elaborate similarity scoring; the
warn event surfaces the audit trail to the user.

#### Scenario: Same-name judges deduped to one declaration
- **GIVEN** plans A and B both declare a judge named
  `RatesHighSeverityJudge` with the same criterion
- **WHEN** consolidation runs
- **THEN** `result.judges` contains exactly one
  `RatesHighSeverityJudge`
- **AND** both A's and B's cases reference it

#### Scenario: Same-name divergent criteria logged
- **GIVEN** plans A and B both declare
  `IdentifiesTriggerJudge` with different criterion strings
- **WHEN** consolidation runs
- **THEN** the result contains the FIRST plan's criterion
- **AND** a warn event names both entries and both criteria

### Requirement: Fixture extraction to disk

Consolidation SHALL move each case's `fixture` (file map) out of
the plan and into a `fixtures` map keyed by case name, ready to
be written to disk. The per-entry `ConsolidatedPlan` SHALL
retain a `fixtureSlug` reference per case so the renderer emits
the correct `useFixture` call.

#### Scenario: Fixture content separated from plan
- **GIVEN** a case with
  `fixture: { ".github/workflows/ci.yml": "..." }`
- **WHEN** consolidation runs
- **THEN** the case's plan in `result.perEntry` has
  `fixtureSlug = <case-name>` and no `fixture` content
- **AND** `result.fixtures[<case-name>]` contains the original
  file map

### Requirement: Generator prompt encourages stable judge names

The generator's `CODE_EVAL_CONTRACT` SHALL include a "Stable
judge naming" section recommending verb-prefix patterns
(`Identifies…Judge`, `Rates…Judge`, `Connects…Judge`,
`RecognizesNo…Judge`) so judges describing the same concept
across multiple behaviors collapse cleanly during consolidation.

The prompt SHALL clarify that the generator does not need to
deduplicate cross-entry — it operates on one entry at a time;
consolidation handles cross-entry dedup automatically.

#### Scenario: Two behaviors emit identically-named judges
- **GIVEN** behaviors `report-pwn-request` and
  `report-comment-chatops` both produce a judge named
  `IdentifiesPrivilegedTriggerJudge`
- **WHEN** consolidation runs
- **THEN** the canonical judge appears once in `_judges.ts`
- **AND** both behaviors' eval files import it
