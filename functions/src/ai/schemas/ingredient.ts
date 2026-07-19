/**
 * Ingredient schemas — shared between frontend forms and Cloud Functions.
 * Every recipe ingredient must satisfy `IngredientSchema`.
 */
import { z } from 'zod';

export const AllergenSchema = z.enum([
  'gluten',
  'dairy',
  'eggs',
  'soy',
  'peanuts',
  'tree_nuts',
  'fish',
  'shellfish',
  'sesame',
  'wheat',
  'mustard',
  'celery',
  'sulfites',
]);
export type Allergen = z.infer<typeof AllergenSchema>;

export const DietaryPatternSchema = z.enum([
  'none',
  'vegetarian',
  'vegan',
  'pescatarian',
  'gluten_free',
  'dairy_free',
  'low_carb',
  'halal_friendly',
  'kosher_style',
]);
export type DietaryPattern = z.infer<typeof DietaryPatternSchema>;

export const ShoppingCategorySchema = z.enum([
  'produce',
  'meat_seafood',
  'dairy_refrigerated',
  'bakery',
  'pantry',
  'spices_seasonings',
  'frozen',
  'canned_jarred',
  'other',
]);
export type ShoppingCategory = z.infer<typeof ShoppingCategorySchema>;

export const UnitSchema = z.enum([
  'g',
  'kg',
  'ml',
  'l',
  'tsp',
  'tbsp',
  'cup',
  'piece',
  'clove',
  'pinch',
  'slice',
  'can',
  'bunch',
  'package',
]);
export type MeasurementUnit = z.infer<typeof UnitSchema>;

/**
 * An ingredient — designed so the consolidated shopping list can group
 * by `normalizedName` + `unit` without losing distinct preparations.
 */
export const IngredientSchema = z.object({
  name: z.string().min(1).max(80),
  normalizedName: z
    .string()
    .min(1)
    .max(80)
    .describe(
      'Lowercased, stripped of plurals/qualifiers — e.g. "yellow onion" → "onion".',
    ),
  quantity: z.number().positive(),
  unit: UnitSchema,
  displayText: z
    .string()
    .describe(
      'Pre-formatted human text, e.g. "1 large yellow onion, diced".',
    ),
  category: ShoppingCategorySchema,
  isOptional: z.boolean().default(false),
  isPantryItem: z.boolean().default(false),
  preparationNote: z.string().max(200).optional(),
  allergenFlags: z.array(AllergenSchema).default([]),
});
export type Ingredient = z.infer<typeof IngredientSchema>;

/**
 * Subset returned to / persisted in the shopping list — preserves the same
 * shape so we can re-derive display text deterministically.
 */
export const ShoppingListItemSchema = IngredientSchema.extend({
  isChecked: z.boolean().default(false),
  isCustom: z.boolean().default(false),
  sortOrder: z.number().int().nonnegative().default(0),
});
export type ShoppingListItem = z.infer<typeof ShoppingListItemSchema>;
