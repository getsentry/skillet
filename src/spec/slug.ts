/**
 * Behavior IDs are kebab-case slugs derived from the rule statement.
 * They serve as the stable join key between spec entries and
 * generated eval cases (`tests_behavior: <id>` and case names like
 * `<id>__<slug-of-prompt>`).
 *
 * Slug derivation rules:
 * - lowercase
 * - alphanumeric + single hyphens only
 * - must start with a letter (matches the structural validator)
 * - leading words like "the/a/an" are not stripped — the LLM should
 *   write statements in imperative voice ("flag X", "recommend Y") so
 *   the first word is already meaningful.
 *
 * Slugs are auto-generated on creation; the user can rename via
 * `spec refine` if they prefer a different identifier.
 */

const MAX_SLUG_WORDS = 8;
const MAX_SLUG_LENGTH = 60;

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "of",
  "in",
  "on",
  "at",
  "to",
  "for",
  "and",
  "or",
  "but",
  "with",
  "without",
  "into",
  "from",
  "as",
  "by",
  "is",
  "are",
  "be",
  "been",
  "being",
  "this",
  "that",
  "these",
  "those",
]);

const slugifyRaw = (input: string): string => {
  return input
    .toLowerCase()
    .replace(/[`"'`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

/**
 * Convert a behavior statement into a kebab-case ID.
 *
 * Drops common stop-words (a, an, the, of, ...) so slugs lead with the
 * meaningful verb/object: "Flag the N+1 queries in loops" →
 * `flag-n-plus-one-queries-loops`.
 *
 * Falls back to `behavior-<n>` if the statement strips down to nothing
 * (e.g. all punctuation) — in which case the caller should pass the
 * collision counter via `fallbackIndex`.
 */
export const slugify = (statement: string, fallbackIndex: number = 0): string => {
  const raw = slugifyRaw(statement);
  if (raw === "") {
    return `behavior-${fallbackIndex}`;
  }

  const words = raw
    .split("-")
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w))
    .slice(0, MAX_SLUG_WORDS);

  let slug = words.join("-");

  // Numbers can't be at the start (slug must start with a letter).
  while (slug.length > 0 && /^\d/.test(slug)) {
    const next = slug.replace(/^[^-]+-?/, "");
    if (next === slug) break;
    slug = next;
  }

  if (slug === "") {
    return `behavior-${fallbackIndex}`;
  }

  if (slug.length > MAX_SLUG_LENGTH) {
    slug = slug.slice(0, MAX_SLUG_LENGTH).replace(/-+$/, "");
  }

  return slug;
};

/**
 * Generate a unique slug given a statement and a set of already-used
 * IDs. Appends `-2`, `-3`, ... on collision.
 */
export const uniqueSlug = (
  statement: string,
  taken: ReadonlySet<string>,
  fallbackIndex: number = 0,
): string => {
  const base = slugify(statement, fallbackIndex);
  if (!taken.has(base)) return base;

  let n = 2;
  while (n < 1000) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
    n++;
  }
  // Pathological case — fall back to fallbackIndex + counter.
  return `behavior-${fallbackIndex}-${Date.now()}`;
};
