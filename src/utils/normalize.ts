/**
 * Unit, name, and quantity normalization helpers — used by shopping list
 * consolidation so we can prove correctness with unit tests.
 */

const PLURAL_EXCEPTIONS: Record<string, string> = {
  potatoes: 'potato',
  tomatoes: 'tomato',
  leaves: 'leaf',
  cloves: 'clove',
};

/**
 * Lowercase + trim + collapse whitespace + naive plural → singular.
 * Good enough for shopping consolidation; not a linguistic tool.
 */
export const normalizeName = (name: string): string => {
  const cleaned = name.trim().toLowerCase().replace(/\s+/g, ' ');
  // Strip short parenthesized descriptors: "tomatoes (cherry)" → "tomatoes"
  const withoutParens = cleaned.replace(/\([^)]*\)/g, '').trim();
  // Singularize common plurals — keep it conservative.
  if (PLURAL_EXCEPTIONS[withoutParens]) {
    return PLURAL_EXCEPTIONS[withoutParens];
  }
  if (/ies$/.test(withoutParens) && withoutParens.length > 4) {
    return withoutParens.replace(/ies$/, 'y');
  }
  if (/es$/.test(withoutParens) && withoutParens.length > 4) {
    return withoutParens.replace(/es$/, '');
  }
  if (/s$/.test(withoutParens) && withoutParens.length > 3) {
    return withoutParens.replace(/s$/, '');
  }
  return withoutParens;
};

/** Units in the same family can combine; otherwise they stay separate. */
const UNIT_FAMILY: Record<string, string> = {
  g: 'mass',
  kg: 'mass',
  ml: 'volume',
  l: 'volume',
  tsp: 'volume',
  tbsp: 'volume',
  cup: 'volume',
};

export const unitFamily = (
  unit: string,
): 'mass' | 'volume' | 'count' | undefined => {
  if (UNIT_FAMILY[unit]) return UNIT_FAMILY[unit] as 'mass' | 'volume';
  return 'count';
};

export const compatibleUnits = (a: string, b: string): boolean => {
  if (a === b) return true;
  return unitFamily(a) === unitFamily(b);
};

/** Best-effort unit conversion within the same family. */
export const toBaseUnit = (
  unit: string,
  qty: number,
): { unit: string; quantity: number } => {
  switch (unit) {
    case 'kg':
      return { unit: 'g', quantity: qty * 1000 };
    case 'l':
      return { unit: 'ml', quantity: qty * 1000 };
    case 'tbsp':
      return { unit: 'tsp', quantity: qty * 3 };
    case 'cup':
      return { unit: 'ml', quantity: qty * 240 };
    default:
      return { unit, quantity: qty };
  }
};
