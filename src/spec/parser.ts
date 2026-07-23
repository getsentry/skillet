import { slugify } from "./slug.js";
import {
  BEHAVIOR_PREFIX,
  CONSTRAINT_PREFIX,
  KNOWN_SECTIONS,
  REQUIRED_SECTIONS,
  SCENARIO_PREFIX,
  SECTION_BEHAVIORS,
  SECTION_CONSTRAINTS,
  SECTION_INTENT,
  SECTION_TRIGGERS,
} from "./template.js";
import type {
  ParseResult,
  ParsedSpec,
  SpecBehavior,
  SpecConstraint,
  Issue,
  SpecScenario,
} from "./types.js";

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^-\s+(.*)$/;
const BOLD_TAG = /^\*\*([A-Z ]+?)\*\*:?\s*(.*)$/;

const isComment = (text: string): boolean => {
  return text.startsWith("<!--") && text.endsWith("-->");
};

/** Template scaffold comments left in structural text mean the spec is unfilled. */
const isPlaceholder = (text: string): boolean => text.includes("<!--");

/**
 * Parse a spec.md document into its structure, collecting structural
 * issues (line-accurate, with fix hints) along the way. Parsing and
 * structural validation are one pass: the parser is the only thing
 * that knows the line numbers.
 */
export const parseSpec = (content: string): ParseResult => {
  const issues: Issue[] = [];
  const error = (message: string, line?: number, hint?: string): void => {
    issues.push({
      severity: "error",
      message,
      ...(line != null && { line }),
      ...(hint != null && { hint }),
    });
  };
  const warn = (message: string, line?: number, hint?: string): void => {
    issues.push({
      severity: "warning",
      message,
      ...(line != null && { line }),
      ...(hint != null && { hint }),
    });
  };

  const lines = content.split("\n");

  let name: string | null = null;
  let section: string | null = null;
  const intentLines: string[] = [];
  const triggers = { should: [] as string[], shouldNot: [] as string[] };
  const behaviors: SpecBehavior[] = [];
  const constraints: SpecConstraint[] = [];
  const seenSections = new Set<string>();

  let behavior: SpecBehavior | null = null;
  let scenario: SpecScenario | null = null;
  let constraint: SpecConstraint | null = null;
  let behaviorText: string[] = [];
  let constraintText: string[] = [];
  let inFence = false;

  const closeScenario = (): void => {
    if (scenario == null) return;
    if (scenario.when.length === 0) {
      error(
        `Scenario "${scenario.name}" has no WHEN bullet`,
        scenario.line,
        'Add "- **WHEN** <condition>" under the scenario heading.',
      );
    }
    if (scenario.then.length === 0) {
      error(
        `Scenario "${scenario.name}" has no THEN bullet`,
        scenario.line,
        'Add "- **THEN** <expected outcome>" under the scenario heading.',
      );
    }
    scenario = null;
  };

  const closeBehavior = (): void => {
    closeScenario();
    if (behavior == null) return;
    behavior.text = behaviorText.join("\n").trim();
    if (isPlaceholder(behavior.text)) {
      error(
        `Behavior "${behavior.name}" still contains the template placeholder`,
        behavior.line,
        "Replace the <!-- ... --> comment with the normative rule.",
      );
    }
    if (behavior.scenarios.length === 0) {
      error(
        `Behavior "${behavior.name}" has no scenarios`,
        behavior.line,
        'Every behavior needs at least one "#### Scenario:" block (exactly four hashes).',
      );
    }
    if (behavior.text !== "" && !/\b(SHALL|MUST)\b/.test(behavior.text)) {
      warn(
        `Behavior "${behavior.name}" has no SHALL/MUST keyword`,
        behavior.line,
        "State the behavior normatively so it reads as a testable requirement.",
      );
    }
    behaviors.push(behavior);
    behavior = null;
    behaviorText = [];
  };

  const closeConstraint = (): void => {
    if (constraint == null) return;
    constraint.text = constraintText.join("\n").trim();
    if (constraint.text !== "" && !/\bMUST NOT\b/.test(constraint.text)) {
      warn(
        `Constraint "${constraint.name}" has no MUST NOT keyword`,
        constraint.line,
        "Constraints state what the skill must never cause.",
      );
    }
    constraints.push(constraint);
    constraint = null;
    constraintText = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i] ?? "";
    const line = raw.trimEnd();

    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
    }
    if (inFence || line.trimStart().startsWith("```")) {
      if (behavior != null && scenario == null) behaviorText.push(raw);
      if (constraint != null) constraintText.push(raw);
      continue;
    }
    if (isComment(line.trim())) continue;

    const heading = HEADING.exec(line);
    if (heading == null) {
      // Non-heading content: route to whatever block is open.
      const bullet = BULLET.exec(line.trim());
      if (section === SECTION_TRIGGERS && bullet != null) {
        const tag = BOLD_TAG.exec(bullet[1] ?? "");
        const kind = tag?.[1]?.trim();
        const text = (tag?.[2] ?? bullet[1] ?? "").trim();
        if (isPlaceholder(text)) {
          error(
            "Trigger bullet still contains the template placeholder",
            lineNo,
            "Replace the <!-- ... --> comment with a real trigger condition.",
          );
        } else if (kind === "SHOULD") triggers.should.push(text);
        else if (kind === "SHOULD NOT") triggers.shouldNot.push(text);
        else {
          warn(
            `Trigger bullet is not tagged SHOULD or SHOULD NOT`,
            lineNo,
            'Write triggers as "- **SHOULD** ..." or "- **SHOULD NOT** ...".',
          );
        }
        continue;
      }
      if (scenario != null && bullet != null) {
        const tag = BOLD_TAG.exec(bullet[1] ?? "");
        const kind = tag?.[1]?.trim();
        const text = (tag?.[2] ?? "").trim();
        if (isPlaceholder(text)) {
          error(
            "Scenario bullet still contains the template placeholder",
            lineNo,
            "Replace the <!-- ... --> comment with the concrete condition or outcome.",
          );
        } else if (kind === "WHEN" || kind === "GIVEN") scenario.when.push(text);
        else if (kind === "THEN" || kind === "AND") scenario.then.push(text);
        else {
          warn(
            `Scenario bullet is not tagged WHEN/GIVEN/THEN/AND`,
            lineNo,
            'Use "- **WHEN** ..." and "- **THEN** ..." bullets.',
          );
        }
        continue;
      }
      if (section === SECTION_INTENT && line.trim() !== "") {
        intentLines.push(line.trim());
      } else if (behavior != null && scenario == null) {
        behaviorText.push(raw);
      } else if (constraint != null) {
        constraintText.push(raw);
      }
      continue;
    }

    const depth = (heading[1] ?? "").length;
    const title = (heading[2] ?? "").trim();

    if (depth === 1) {
      if (name == null) {
        name = title;
      } else {
        error(
          `Unexpected second top-level heading "${title}"`,
          lineNo,
          "A spec has exactly one # title.",
        );
      }
      continue;
    }

    if (depth === 2) {
      closeBehavior();
      closeConstraint();
      section = title;
      if (!(KNOWN_SECTIONS as readonly string[]).includes(title)) {
        warn(
          `Unknown section "## ${title}"`,
          lineNo,
          `Known sections: ${KNOWN_SECTIONS.join(", ")}.`,
        );
      } else {
        seenSections.add(title);
      }
      continue;
    }

    // Depth 3–6: behavior/scenario/constraint blocks and their misuses.
    if (line.startsWith(BEHAVIOR_PREFIX)) {
      closeBehavior();
      closeConstraint();
      if (section !== SECTION_BEHAVIORS) {
        error(
          `Behavior "${title}" outside the Behaviors section`,
          lineNo,
          'Move "### Behavior:" blocks under "## Behaviors".',
        );
      }
      const behaviorName = title.slice("Behavior:".length).trim();
      if (isPlaceholder(behaviorName)) {
        error(
          "Behavior name still contains the template placeholder",
          lineNo,
          "Replace the <!-- ... --> comment with a short behavior name.",
        );
        continue;
      }
      behavior = {
        id: slugify(behaviorName),
        name: behaviorName,
        line: lineNo,
        text: "",
        scenarios: [],
      };
      continue;
    }
    if (line.startsWith(SCENARIO_PREFIX)) {
      closeScenario();
      const scenarioName = title.slice("Scenario:".length).trim();
      if (isPlaceholder(scenarioName)) {
        error(
          "Scenario name still contains the template placeholder",
          lineNo,
          "Replace the <!-- ... --> comment with a concrete situation.",
        );
        continue;
      }
      if (behavior == null) {
        error(
          `Scenario "${scenarioName}" has no enclosing behavior`,
          lineNo,
          'Scenarios live under a "### Behavior:" block.',
        );
        continue;
      }
      scenario = { name: scenarioName, line: lineNo, when: [], then: [] };
      behavior.scenarios.push(scenario);
      continue;
    }
    if (line.startsWith(CONSTRAINT_PREFIX)) {
      closeBehavior();
      closeConstraint();
      if (section !== SECTION_CONSTRAINTS) {
        error(
          `Constraint "${title}" outside the Constraints section`,
          lineNo,
          'Move "### Constraint:" blocks under "## Constraints".',
        );
      }
      const constraintName = title.slice("Constraint:".length).trim();
      if (isPlaceholder(constraintName)) {
        error(
          "Constraint name still contains the template placeholder",
          lineNo,
          "Replace the <!-- ... --> comment with a short constraint name.",
        );
        continue;
      }
      constraint = { id: slugify(constraintName), name: constraintName, line: lineNo, text: "" };
      continue;
    }

    // Right keyword, wrong depth — the classic silent-drop hazard.
    if (title.startsWith("Scenario:")) {
      error(
        `Scenario heading has ${depth} hashes`,
        lineNo,
        'Scenarios require exactly four hashes: "#### Scenario: <name>".',
      );
      continue;
    }
    if (title.startsWith("Behavior:")) {
      error(
        `Behavior heading has ${depth} hashes`,
        lineNo,
        'Behaviors require exactly three hashes: "### Behavior: <name>".',
      );
      continue;
    }
    if (title.startsWith("Constraint:")) {
      error(
        `Constraint heading has ${depth} hashes`,
        lineNo,
        'Constraints require exactly three hashes: "### Constraint: <name>".',
      );
      continue;
    }
    warn(
      `Unrecognized heading "${line}"`,
      lineNo,
      'Inside sections, use "### Behavior:", "#### Scenario:", or "### Constraint:" headings.',
    );
  }

  closeBehavior();
  closeConstraint();

  if (inFence) {
    warn("Unclosed code fence", lines.length, "Close the ``` fence.");
  }
  if (name == null) {
    error("Missing top-level title", 1, 'Start the spec with "# <Skill Name>".');
  }
  for (const required of REQUIRED_SECTIONS) {
    if (!seenSections.has(required)) {
      error(
        `Missing required section "## ${required}"`,
        undefined,
        `Add a "## ${required}" section.`,
      );
    }
  }
  if (seenSections.has(SECTION_INTENT) && intentLines.length === 0) {
    error(
      "Intent section is empty",
      undefined,
      "Describe what the skill makes the agent do and why.",
    );
  }
  if (seenSections.has(SECTION_BEHAVIORS) && behaviors.length === 0) {
    error(
      "Behaviors section has no behaviors",
      undefined,
      'Add at least one "### Behavior:" block.',
    );
  }
  if (
    seenSections.has(SECTION_TRIGGERS) &&
    triggers.should.length === 0 &&
    triggers.shouldNot.length === 0
  ) {
    warn(
      "Triggers section has no trigger bullets",
      undefined,
      'Add "- **SHOULD** ..." / "- **SHOULD NOT** ..." bullets.',
    );
  }

  const byId = new Map<string, SpecBehavior | SpecConstraint>();
  for (const item of [...behaviors, ...constraints]) {
    if (item.id === "") {
      error(
        `Heading "${item.name}" produces an empty identifier`,
        item.line,
        "Use at least one alphanumeric character in the name.",
      );
      continue;
    }
    const existing = byId.get(item.id);
    if (existing != null) {
      error(
        `Duplicate identifier "${item.id}" (lines ${existing.line} and ${item.line})`,
        item.line,
        "Rename one of the headings so identifiers stay unique.",
      );
    } else {
      byId.set(item.id, item);
    }
  }

  const spec: ParsedSpec | null =
    name == null
      ? null
      : {
          name,
          intent: intentLines.join("\n"),
          triggers,
          behaviors,
          constraints,
        };

  return { spec, issues };
};
