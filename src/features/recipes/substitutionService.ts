/**
 * Async wrapper around the curated substitution table.
 *
 * Today this resolves `Promise.resolve(localTableLookup)`. When Item 1
 * (Firebase deploy) lands and the Cloud Function `/api/substitutions?q=`
 * is reachable, this is the *only* file that has to change to point at the
 * remote endpoint \u2014 the React UI in `SwapIngredientDialog.tsx` already
 * awaits `getSubstitutions(normalizedName)` and renders whatever shape
 * `SubstitutionCandidate[]` it returns.
 */

import { SUBSTITUTIONS, type SubstitutionEntry } from '@/data/substitutions';
import type { Allergen } from '@/schemas/ingredient';

export type SubstitutionCandidate = Omit<SubstitutionEntry, 'aliases'>;

const lookupLocal = (normalizedName: string): SubstitutionCandidate[] => {
  const needle = normalizedName.trim().toLowerCase();
  if (!needle) return [];
  const matches = SUBSTITUTIONS.filter((entry) => {
    if (entry.original === needle) return true;
    return entry.aliases?.some((alias) => alias.toLowerCase() === needle) ?? false;
  });
  // Drop the `aliases` field from the public shape \u2014 callers don't need it.
  return matches.map(({ aliases: _aliases, ...rest }) => rest);
};

/**
 * Resolve candidates for a given normalized ingredient name. Today: sync
 * local table wrapped in `Promise.resolve`. Tomorrow: `fetch('/api/substitutions?q=')`.
 */
export const getSubstitutions = async (
  normalizedName: string,
): Promise<SubstitutionCandidate[]> => lookupLocal(normalizedName);

/**
 * Re-export for code that needs to know which allergens a candidate adds,
 * without trucking through the data shape.
 */
export type { Allergen };
