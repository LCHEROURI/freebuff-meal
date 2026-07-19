/**
 * Shopping list consolidation.
 *
 * Strategy:
 *   1. Normalize every incoming ingredient to its base unit (g, ml, count).
 *   2. Key by `(normalizedName, baseUnit, preparationNote, isOptional)` — so
 *      compatible intra-family units naturally combine and incompatible
 *      unit families (mass vs volume vs count) stay separated.
 *   3. Group by category rank; surface pantry items separately.
 *
 * Deterministic, idempotent, and provably correct via unit tests.
 */
import {
  ShoppingCategorySchema,
  type ShoppingCategory,
  type ShoppingListItem,
  type Ingredient,
  type MeasurementUnit,
} from '@/schemas/ingredient';
import {
  compatibleUnits,
  normalizeName,
  toBaseUnit,
  unitFamily,
} from '@/utils/normalize';

const CATEGORY_RANK: Record<ShoppingCategory, number> = {
  produce: 0,
  meat_seafood: 1,
  dairy_refrigerated: 2,
  bakery: 3,
  frozen: 4,
  canned_jarred: 5,
  spices_seasonings: 6,
  pantry: 7,
  other: 8,
};

type Unit = MeasurementUnit;
type RecipeMarker = { recipeId?: string; recipeName?: string };

export type ConsolidateInput = Ingredient & RecipeMarker;

type Acc = {
  id: string; // stable across inputs so we can return them in deterministic order
  name: string;
  normalizedName: string;
  category: ShoppingCategory;
  isOptional: boolean;
  isPantryItem: boolean;
  preparationNote: string | undefined;
  allergenFlags: ShoppingListItem['allergenFlags'];
  unit: Unit;
  quantity: number;
  unitFamily: 'mass' | 'volume' | 'count';
  recipeIds: Set<string>;
  recipeNames: Set<string>;
};

/**
 * Normalize unit + quantity up-front. This is the keystone fix: we never
 * store "1 kg" — it becomes "1000 g" so the dedupe key is shared with any
 * separate "500 g" entries of the same ingredient.
 */
const normalizeBase = (unit: Unit, quantity: number) => {
  const base = toBaseUnit(unit, quantity);
  return { unit: base.unit as Unit, quantity: base.quantity };
};

/**
 * Stable, deterministic id used by the React `key` for shopping rows and by
 * the ShoppingListPage mutations (toggle/remove/edit). Adding prepNote and
 * category into the key prevents collisions for two same-name, same-unit
 * ingredients with different preparations (e.g. "onion, sliced" vs "onion,
 * diced").
 */
export const itemIdentity = (
  normalizedName: string,
  unit: Unit,
  preparationNote: string | undefined,
  category: string,
): string =>
  `${normalizedName}|${unit}|${preparationNote ?? ''}|${category}`;

const stableId = (
  name: string,
  unit: Unit,
  preparationNote: string | undefined,
  isOptional: boolean,
  index = 0,
): string =>
  `${name}|${unit}|${preparationNote ?? ''}|${isOptional ? 'opt' : 'req'}|${
    index ? `i${index}` : 'p'
  }`;

export const consolidate = (
  ingredients: ConsolidateInput[],
  pantryItems: string[] = [],
): ShoppingListItem[] => {
  const accByKey = new Map<string, Acc>();
  const extraCounters = new Map<string, number>();

  for (const ing of ingredients) {
    const norm = (ing.normalizedName || normalizeName(ing.name)).trim();
    if (!norm) continue;
    const base = normalizeBase(ing.unit, ing.quantity);
    const prepKey = ing.preparationNote ?? '';
    const optKey = ing.isOptional ? 'opt' : 'req';
    let key = `${norm}|${base.unit}|${prepKey}|${optKey}`;
    // If the same key already holds a value (e.g. two distinct preparations
    // that happen to share a note — extremely rare but defensive), suffix it.
    if (accByKey.has(key)) {
      const count = (extraCounters.get(key) ?? 1) + 1;
      extraCounters.set(key, count);
      key = `${key}|${count}`;
    }
    const family = unitFamily(base.unit) ?? 'count';
    accByKey.set(key, {
      id: stableId(norm, base.unit, ing.preparationNote, ing.isOptional, extraCounters.get(key)),
      name: ing.name,
      normalizedName: norm,
      category: ShoppingCategorySchema.parse(ing.category),
      isOptional: ing.isOptional,
      isPantryItem: ing.isPantryItem,
      preparationNote: ing.preparationNote,
      allergenFlags: (ing.allergenFlags ?? []) as ShoppingListItem['allergenFlags'],
      unit: base.unit,
      quantity: base.quantity,
      unitFamily: family as Acc['unitFamily'],
      recipeIds: new Set(ing.recipeId ? [ing.recipeId] : []),
      recipeNames: new Set(ing.recipeName ? [ing.recipeName] : []),
    });
  }

  // Summarize: combine acc entries that share a key naturally; for entries
  // created with distinct keys, we still need to merge when preparationNote
  // and isOptional and unitFamily all match. Walk again.
  const merged = new Map<string, Acc>();
  for (const acc of accByKey.values()) {
    // Compose a merge-friendly key that ignores voluntary distinction counters
    // but still respects preparation differences and family compatibility.
    const mergeKey = `${acc.normalizedName}|${acc.unit}|${acc.preparationNote ?? ''}|${
      acc.isOptional ? 'opt' : 'req'
    }|${acc.unitFamily}`;
    const existing = merged.get(mergeKey);
    if (existing && compatibleUnits(existing.unit, acc.unit)) {
      existing.quantity += acc.quantity;
      acc.recipeIds.forEach((id) => existing.recipeIds.add(id));
      acc.recipeNames.forEach((n) => existing.recipeNames.add(n));
    } else {
      merged.set(mergeKey, { ...acc });
    }
  }

  // Pantry comes last — separate group.
  const pantryAcc: Acc[] = pantryItems
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name, i) => ({
      id: stableId(`pantry-${i}`, 'piece', undefined, false, i),
      name,
      normalizedName: normalizeName(name),
      category: 'pantry' as ShoppingCategory,
      isOptional: false,
      isPantryItem: true,
      preparationNote: undefined,
      allergenFlags: [],
      unit: 'piece',
      quantity: 1,
      unitFamily: 'count',
      recipeIds: new Set(),
      recipeNames: new Set(),
    }));

  const all = [...merged.values(), ...pantryAcc];

  return all
    .map((acc, idx) => {
      const item = toShoppingItem(acc, idx);
      // sortOrder mirrors the *display* position in the sorted output. The
      // ShoppingListPage uses array index for UI ordering; this keeps the
      // persisted value aligned for any future drag-and-drop reorder work.
      item.sortOrder = idx;
      return item;
    })
    .sort((a, b) => {
      if (a.isPantryItem !== b.isPantryItem) return a.isPantryItem ? 1 : -1;
      const cmp = CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category];
      if (cmp !== 0) return cmp;
      return a.normalizedName.localeCompare(b.normalizedName);
    });
};

const toShoppingItem = (acc: Acc, order: number): ShoppingListItem => {
  const displayQty =
    acc.unitFamily === 'count'
      ? roundCount(acc.quantity)
      : roundMassOrVolume(acc.quantity);
  const unitText = pluralizeUnit(acc.unit, displayQty);
  const recipesLabel =
    acc.recipeIds.size > 1 ? ` (used in ${acc.recipeIds.size} recipes)` : '';
  const prepText = acc.preparationNote ? `, ${acc.preparationNote}` : '';
  return {
    name: acc.name,
    normalizedName: acc.normalizedName,
    category: acc.category,
    isOptional: acc.isOptional,
    isPantryItem: acc.isPantryItem || acc.category === 'pantry',
    preparationNote: acc.preparationNote,
    allergenFlags: acc.allergenFlags,
    quantity: displayQty,
    unit: acc.unit,
    displayText: `${displayQty} ${unitText} ${acc.name}${prepText}${recipesLabel}`,
    isChecked: false,
    isCustom: false,
    sortOrder: order,
  };
};

const roundCount = (q: number): number => {
  if (q >= 1 && Number.isInteger(q)) return q;
  return Math.round(q);
};

const roundMassOrVolume = (q: number): number => Math.round(q * 100) / 100;

/**
 * Pluralize the unit for display. We only flip a few well-known "count" units
 * — most of our base units are already plural-neutral ("g", "ml").
 */
const pluralizeUnit = (unit: Unit, qty: number): string => {
  if (qty === 1) return unit;
  // Singular → plural for count units where it reads naturally.
  switch (unit) {
    case 'piece':
      return 'pieces';
    case 'clove':
      return 'cloves';
    case 'slice':
      return 'slices';
    case 'can':
      return 'cans';
    case 'bunch':
      return 'bunches';
    case 'package':
      return 'packages';
    default:
      return unit;
  }
};
