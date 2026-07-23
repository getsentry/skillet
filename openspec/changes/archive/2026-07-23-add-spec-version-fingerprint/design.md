# Design

## Footer Format

Use one stable standalone HTML comment at the end of `spec.md`:

```markdown
<!-- skillet-version: 1.4.1 -->
```

The version is the running package's stable semantic version. HTML comments are already ignored by the parser when they appear as standalone lines, so the footer does not enter intent, behavior, scenario, or constraint text.

## Compatibility

The footer is emitted by templates and required by current authoring guidance, but absence is not a validation error. This avoids invalidating existing repositories while making provenance standard for future writes.
