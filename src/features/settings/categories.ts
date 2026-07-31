/**
 * Pure helpers for the custom-categories feature.
 *
 * No React. No Zustand. No side effects. These run in render paths and in
 * tests, so they must stay fast + deterministic.
 *
 * The pattern is: stringify the user input the same way every time
 * (`normalizeCategoryName`), then compare with a case-insensitive matcher
 * (`isDuplicate`) to keep "Korean" / "korean " / "KOREAN" / "  KoReAn "
 * treated as a single category.
 */

import type { UserProfile } from '@/schemas/auth';

// Always-kept rationale, kept beside the rule so future PRs find both
// together when changing the contract:
/**
 * Returns `null` if:
 *   - the input isn't a string,
 *   - it collapses to empty,
 *   - it exceeds the 40-char cap,
 *   - it contains list separators (` ,;:|` ) — those would render as a
 *     confusing single chip and offer no signal beyond "use a single name".
 *     Slash-bearing names like `"a/b"` are intentionally ALLOWED — they are
 *     a rare edge case and rejecting them silently is harsh. If a future
 *     PR wants to add `/` to the reject list, update LIST_SEPARATOR_RE
 *     AND the corresponding `normalizeCategoryName` test together.
 *   - it contains no letters at all (e.g. `'.'` or `'-'`).
 */
const LIST_SEPARATOR_RE = /[,;:|]/;
const LETTER_RE = /\p{L}/u;
export const DEFAULT_FAVORITE_CUISINES = [
  'Italian',
  'Mexican',
  'Greek',
  'Indian',
  'Japanese',
  'Thai',
  'French',
  'North African',
  'American',
  'Middle Eastern',
] as const;

export const DEFAULT_AVAILABLE_EQUIPMENT = [
  'Stovetop',
  'Oven',
  'Sheet pan',
  'Air fryer',
  'Wok',
  'Pressure cooker',
  'Slow cooker',
  'Blender',
] as const;

export type CategoryKind = 'favoriteCuisines' | 'availableEquipment';

const MAX_CUSTOM_CATEGORIES = 20;
const MAX_NAME_LENGTH = 40;

/**
 * Normalises user-entered text for storage + comparison.
 *
 * Trims, collapses internal whitespace, and Title-Cases the first letter of
 * each whitespace-separated word (so "korean bbq" → "Korean Bbq", "sous vide"
 * → "Sous Vide"). This keeps the rendered chip list visually consistent
 * regardless of how the user typed the input.
 *
 * The full rejection-rule rationale is documented at the LIST_SEPARATOR_RE /
 * LETTER_RE declarations at the top of this file.
 */
export const normalizeCategoryName = (raw: string): string | null => {
  if (typeof raw !== 'string') return null;
  if (LIST_SEPARATOR_RE.test(raw)) return null;
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (collapsed.length === 0) return null;
  if (collapsed.length > MAX_NAME_LENGTH) return null;
  if (!LETTER_RE.test(collapsed)) return null;
  // Title-case each word. After lowering, capitalise the first letter of
  // every word AND any letter immediately following an apostrophe, so
  // "O'BRIEN" → "O'Brien" (instead of the stale "O'brien").
  return collapsed
    .split(' ')
    .map((word) =>
      word.toLowerCase().replace(/(^|')(\p{L})/gu, (_match, prev: string, ch: string) =>
        prev + ch.toUpperCase(),
      ),
    )
    .join(' ');
};

/** Lowercased form used for case-insensitive comparison. */
const fold = (s: string): string => s.trim().toLowerCase();

/**
 * Returns the first existing matching category in `existing` (case-folded) or
 * `null` if none. Use this to decide whether a candidate add is a duplicate.
 */
export const findDuplicate = (
  candidate: string,
  existing: readonly string[],
): string | null => {
  const target = fold(normalizeCategoryName(candidate) ?? '');
  if (target.length === 0) return null;
  for (const item of existing) {
    if (fold(item) === target) return item;
  }
  return null;
};

export const isCategoryDuplicate = (
  candidate: string,
  defaults: readonly string[],
  customs: readonly string[],
  selection: readonly string[],
): boolean =>
  findDuplicate(candidate, [...defaults, ...customs, ...selection]) !== null;

/**
 * Merges defaults + customs to produce the rendered chip list.
 *
 * Custom categories always render after defaults — predictable ordering, and
 * the visual tail of the chip tray tells the user which chips they added.
 *
 * De-duplication is case-insensitive: if a custom matches a default, the
 * default wins and the custom is dropped (and reported back to the caller
 * via `droppedFromCustoms` so it can be pruned from the profile).
 */
export const mergeWithDefaults = (
  defaults: readonly string[],
  customs: readonly string[],
): { available: string[]; droppedFromCustoms: string[] } => {
  const seen = new Set<string>();
  const available: string[] = [];
  const droppedFromCustoms: string[] = [];

  for (const def of defaults) {
    const key = fold(def);
    if (!seen.has(key) && key.length > 0) {
      seen.add(key);
      available.push(def);
    }
  }
  for (const custom of customs) {
    const key = fold(custom);
    if (key.length === 0) continue;
    if (!seen.has(key)) {
      seen.add(key);
      available.push(custom);
    } else {
      droppedFromCustoms.push(custom);
    }
  }
  return { available, droppedFromCustoms };
};

/** True when the user can add a fresh custom category to a list. */
export const canAddCustom = (customs: readonly string[]): boolean =>
  customs.length < MAX_CUSTOM_CATEGORIES;

/** Pulls the right field pair off a profile for a given category kind. */
export const readCategoryFields = (
  profile: Pick<UserProfile, 'customFavoriteCuisines' | 'customEquipment'>,
  kind: CategoryKind,
): string[] => {
  if (kind === 'favoriteCuisines') return profile.customFavoriteCuisines ?? [];
  return profile.customEquipment ?? [];
};

export const __constants__ = {
  MAX_CUSTOM_CATEGORIES,
  MAX_NAME_LENGTH,
};
