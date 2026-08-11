/**
 * Field-UI annotations — one `makeFieldUIAnnotations()` call per form surface.
 *
 * Each call maps the schema's free-text fields to their voice-append
 * separator (comma-list → ", " / paragraph → "\n"). Pass them to
 * `<FormInput fieldUI={...} field="..." />` or
 * `<FormTextarea fieldUI={...} field="..." />` from
 * `@/components/common/FormInput`.
 */
import { MealPlanGenerationInputSchema } from '@/schemas/mealPlan';
import { PantryItemSchema } from '@/schemas/pantry';
import { RecipeSchema } from '@/schemas/recipe';
import { ShoppingListItemSchema } from '@/schemas/ingredient';
import { makeFieldUIAnnotations } from '@/lib/fieldUIAnnotations';

export const mealPlanFieldUI = makeFieldUIAnnotations(
  MealPlanGenerationInputSchema,
  {
    commaListFields: [
      'pantryIngredients',
      'useSoonIngredients',
      'excludedIngredients',
    ],
    paragraphFields: ['notes'],
  },
);

export const pantryFieldUI = makeFieldUIAnnotations(PantryItemSchema, {
  paragraphFields: ['note'],
});

export const recipeFieldUI = makeFieldUIAnnotations(RecipeSchema, {
  paragraphFields: ['leftoverInstructions'],
});

export const shoppingListFieldUI = makeFieldUIAnnotations(
  ShoppingListItemSchema,
  {
    paragraphFields: ['preparationNote'],
  },
);
