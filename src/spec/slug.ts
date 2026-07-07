/**
 * Behavior and constraint identifiers are kebab-case slugs of their
 * headings: "Commit message format" → `commit-message-format`.
 * Duplicates are a validation error rather than auto-suffixed — the
 * heading is the identity, so colliding headings must be renamed.
 */
export const slugify = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[`"']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};
