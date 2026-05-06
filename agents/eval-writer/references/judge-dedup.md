# Judge Naming and Dedup

Judges are **suite-wide artifacts**. Many behaviors share check
shapes — "did the agent identify the trigger?", "did it rate
severity?", "did it connect the exploit chain?". These should
each be ONE canonical judge declared in `evals/_judges.ts` and
referenced from every behavior that needs it.

## Default to reuse

When you sit down to declare a judge, ask first: "is there a
reasonable canonical name some other behavior in this skill
would also use?" If yes, use that name. New names should appear
only when the property is genuinely specific to this one
behavior.

When `_judges.ts` already exists, **read it first**. Reuse
names verbatim. Only invent new names for properties no
existing judge covers.

## Canonical naming stems

Pick the smallest stem that fits. Don't be cute. **Do not** add
modifiers like `Correctly`, `Properly`, `Successfully`,
`Accurately`, `Reasonably` — they don't change the meaning,
they just defeat dedup. Two behaviors that both need the
"identifies the trigger" check should both name their judge
`IdentifiesPrivilegedTriggerJudge` — not
`IdentifiesPrivilegedTriggerCorrectlyJudge` or
`IdentifiesPullRequestTargetTriggerJudge`.

| Stem | Use |
|------|-----|
| `Identifies…Judge` | agent named the artifact / trigger / sink / role / construct |
| `Rates…Judge` | agent assigned a severity / confidence / rating |
| `Connects…Judge` | agent tied two concepts together (trigger → impact, input → sink, etc.) |
| `Distinguishes…Judge` | agent correctly differentiated between two adjacent concepts |
| `Recommends…Judge` | agent emitted a remediation / fix / hardening |
| `Explains…Judge` | agent justified a verdict with reasoning |
| `Includes…Judge` | agent included a required output element (file/line, fix code, etc.) |
| `DoesNotFlag…Judge` | must_not: agent did NOT flag a non-issue |
| `DoesNotFabricate…Judge` | must_not: agent did NOT invent a missing piece of evidence |
| `DoesNotRecommend…Judge` | must_not: agent did NOT recommend something forbidden |

## Examples

**Good (reuses across behaviors):**
```ts
IdentifiesPrivilegedTriggerJudge   // used by report-pwn-request, report-credential-exposure, state-entry-point
RatesHighSeverityJudge             // used by anything that tests severity calibration on a HIGH case
ConnectsExploitChainJudge          // used by report-pwn-request, report-toctou, report-comment-chatops
```

**Bad (over-specific, defeats dedup):**
```ts
IdentifiesPullRequestTargetTriggerJudge       // too specific — use IdentifiesPrivilegedTriggerJudge
RatesHighSeverityCorrectlyJudge               // "Correctly" adds nothing — drop it
ConnectsExploitChainForPwnRequestJudge        // bake the case in the criterion text, not the name
```

The validator renames judges that violate these patterns —
ship clean names from the start to avoid the round trip.

## `_judges.ts` shape

```ts
import { criterionJudge } from "@sentry/skillet/evals";

export const ConnectsExploitChainJudge = criterionJudge(
  "ConnectsExploitChainJudge",
  "Ties the privileged trigger to checkout or execution of PR-controlled code with secrets available.",
);

export const IdentifiesPrivilegedTriggerJudge = criterionJudge(
  "IdentifiesPrivilegedTriggerJudge",
  "Names the privileged trigger (pull_request_target, workflow_run, etc.) by exact name in its analysis.",
);

// … one export per canonical judge, sorted by name.
```

The first arg to `criterionJudge` MUST equal the const name —
the LLM judge call uses it for telemetry and dedup.

## Criterion text

- ≤200 characters.
- 1-2 sentences.
- Tests ONE property. **The word "AND" in a criterion is a
  smell.** If a criterion conjoins two properties (e.g.
  "identifies the trigger AND rates severity"), split into two
  narrow judges.
- Doesn't bake the case scenario into the wording — judges are
  shared across cases, so keep the text general.

### Splitting bundled criteria

When you catch a criterion bundling properties — even one "AND"
— split it. Each property gets its own canonical-stem judge,
and the case references both. The cost is one extra judge call
at test time; the benefit is two independent signals when one
fails (you know whether the agent missed the trigger, missed
the severity, or both).

**Before (bundled — one judge, two properties):**
```ts
ConnectsExploitChainJudge: "Ties the privileged trigger to
checkout of PR-controlled code AND rates HIGH or CRITICAL
severity."
```

**After (split — two judges, one property each):**
```ts
ConnectsExploitChainJudge: "Ties the privileged trigger to
checkout or execution of PR-controlled code with secrets
available."

RatesHighSeverityJudge: "Rates the finding HIGH or CRITICAL
severity."
```

The case references both:
```ts
await expect(result).toSatisfyJudge(ConnectsExploitChainJudge, { threshold: 0.75 });
await expect(result).toSatisfyJudge(RatesHighSeverityJudge, { threshold: 0.75 });
```

**Good criteria:**
- "Names the privileged trigger (pull_request_target, workflow_run, etc.) in its analysis."
- "Rates the finding HIGH or CRITICAL severity."
- "Includes the file path and line number of the vulnerable code in its output."

**Bad criteria:**
- "For the report-pwn-request case, identifies the trigger AND rates severity AND recommends a fix." (three properties; case-specific)
- "Successfully and accurately identifies the trigger." (modifiers; defeats dedup)
- "Says the right thing about workflows." (vague; not testable)
