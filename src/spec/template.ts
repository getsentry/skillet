/**
 * The spec.md grammar in one place: section names, heading depths,
 * and the scaffold template `skillet new` writes.
 */

export const SECTION_INTENT = "Intent";
export const SECTION_TRIGGERS = "Triggers";
export const SECTION_BEHAVIORS = "Behaviors";
export const SECTION_CONSTRAINTS = "Constraints";

export const KNOWN_SECTIONS = [
  SECTION_INTENT,
  SECTION_TRIGGERS,
  SECTION_BEHAVIORS,
  SECTION_CONSTRAINTS,
] as const;

export const REQUIRED_SECTIONS = [SECTION_INTENT, SECTION_TRIGGERS, SECTION_BEHAVIORS] as const;

export const BEHAVIOR_PREFIX = "### Behavior: ";
export const SCENARIO_PREFIX = "#### Scenario: ";
export const CONSTRAINT_PREFIX = "### Constraint: ";

export const specTemplate = (skillName: string): string => `# ${skillName}

## Intent

<!-- One or two paragraphs: what this skill makes the agent do, and why it exists. -->

## Triggers

- **SHOULD** <!-- situation where the skill applies -->
- **SHOULD NOT** <!-- nearby situation where it must stay quiet -->

## Behaviors

### Behavior: <!-- short name, e.g. "Commit message format" -->

The agent SHALL <!-- one observable, testable behavior -->.

#### Scenario: <!-- concrete situation -->

- **WHEN** <!-- the setup and the user ask -->
- **THEN** <!-- the observable outcome -->

## Constraints

### Constraint: <!-- short name -->

The agent MUST NOT <!-- thing this skill must never cause -->.
`;
