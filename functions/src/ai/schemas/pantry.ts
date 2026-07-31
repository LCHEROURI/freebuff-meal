import { z } from 'zod';

/**
 * Per-user persistent pantry item. One row = one food the cook wants to
 * remember across cooking sessions. Used to:
 *
 *  1. Drive ambient input — the user just *says* ingredients, we
 *     extract + dedup + write a `pantryItems/{itemId}` document.
 *  2. Feed the MealPlan generator — future weeks preferentially reuse
 *     these ingredients so the cook's existing stock matters.
 *  3. Score freshness — `timesUsed` + `lastUsedAt` flag stale items in
 *     a soft UI hint (no forced eviction).
 *
 * Identity: `ownerId + normalizedName + condition` is the dedup key.
 * A "frozen chicken" and a "fresh chicken" are *different items*.
 */
export const PantryItemSourceEnum = z.enum(['voice', 'manual', 'recipe_consumed']);
export type PantryItemSource = z.infer<typeof PantryItemSourceEnum>;

export const PantryItemConditionSchema = z.enum([
  'fresh',
  'frozen',
  'cooked',
  'leftover',
  'canned',
  'dried',
  'other',
]);
export type PantryItemCondition = z.infer<typeof PantryItemConditionSchema>;

export const PantryItemSchema = z.object({
  id: z.string().min(1).max(80),
  /** Firebase Auth UID of the owning cook. */
  ownerId: z.string().min(1).max(80),
  name: z.string().min(1).max(80),
  /**
   * Lowercased, whitespace-normalized form of `name`. Used as the
   * dedup key together with `condition` so the parser can detect
   * "I already have chicken" without doing a fuzzy match.
   */
  normalizedName: z.string().min(1).max(80),
  quantity: z.number().positive().nullable(),
  unit: z.string().min(1).max(40).nullable(),
  condition: PantryItemConditionSchema.nullable(),
  source: PantryItemSourceEnum,
  /** Confidence from the LLM extractor (0..1). 1.0 for manual entries. */
  confidence: z.number().min(0).max(1).default(0.6),
  addedAt: z.string().datetime(),
  /** Null until the cook's meal-plan consumes this item at least once. */
  lastUsedAt: z.string().datetime().nullable(),
  timesUsed: z.number().int().nonnegative().default(0),
  /** Free-form note typed/recorded alongside the pantry entry. */
  note: z.string().max(200).nullable().default(null),
});

export type PantryItem = z.infer<typeof PantryItemSchema>;

/** Reduce an arbitrary name to the dedup key + leftovers for storage. */
export const normalizePantryName = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Composite dedupe key used as the row identity for `pantryItems/`.
 * Pure — runs in both directions across the sync-gate so the client
 * can compute the same key the server uses.
 */
export const dedupeKey = (
  ownerId: string,
  normalizedName: string,
  condition: PantryItemCondition | null,
): string => `${ownerId}|${normalizedName}|${condition ?? 'unspecified'}`;
