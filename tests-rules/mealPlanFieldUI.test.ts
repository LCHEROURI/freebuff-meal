import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  makeFieldUIAnnotations,
  COMMA_LIST_SEPARATOR,
  PARAGRAPH_SEPARATOR,
} from '@/lib/fieldUIAnnotations';

import {
  mealPlanFieldUI,
  pantryFieldUI,
  recipeFieldUI,
  shoppingListFieldUI,
} from '@/lib/fieldUI';

// ---------------------------------------------------------------------------
// Generic factory
// ---------------------------------------------------------------------------

describe('makeFieldUIAnnotations', () => {
  const testSchema = z.object({
    name: z.string(),
    tags: z.string(),
    note: z.string(),
    count: z.number(),
  });

  const ui = makeFieldUIAnnotations(testSchema, {
    commaListFields: ['tags'],
    paragraphFields: ['note'],
  });

  it('maps comma-list fields to ", "', () => {
    expect(ui.map.tags).toBe(COMMA_LIST_SEPARATOR);
  });

  it('maps paragraph fields to "\\n"', () => {
    expect(ui.map.note).toBe(PARAGRAPH_SEPARATOR);
  });

  it('leaves non-annotated fields undefined', () => {
    expect(ui.map.name).toBeUndefined();
    expect(ui.map.count).toBeUndefined();
  });

  it('resolve returns separators for annotated fields', () => {
    expect(ui.resolve('tags')).toBe(COMMA_LIST_SEPARATOR);
    expect(ui.resolve('note')).toBe(PARAGRAPH_SEPARATOR);
  });

  it('resolve returns undefined for non-annotated fields', () => {
    expect(ui.resolve('name')).toBeUndefined();
    expect(ui.resolve('count')).toBeUndefined();
  });

  it('isVoiceAppend returns true for annotated fields', () => {
    expect(ui.isVoiceAppend('tags')).toBe(true);
    expect(ui.isVoiceAppend('note')).toBe(true);
  });

  it('isVoiceAppend returns false for non-annotated fields', () => {
    expect(ui.isVoiceAppend('name')).toBe(false);
    expect(ui.isVoiceAppend('count')).toBe(false);
  });

  it('works with empty config (no fields annotated)', () => {
    const empty = makeFieldUIAnnotations(testSchema, {});
    expect(Object.keys(empty.map)).toHaveLength(0);
    expect(empty.resolve('name')).toBeUndefined();
    expect(empty.isVoiceAppend('name')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Meal-plan field UI
// ---------------------------------------------------------------------------

describe('mealPlanFieldUI', () => {
  it('has the four expected additive-voice fields with their separators', () => {
    expect(mealPlanFieldUI.resolve('pantryIngredients')).toBe(', ');
    expect(mealPlanFieldUI.resolve('useSoonIngredients')).toBe(', ');
    expect(mealPlanFieldUI.resolve('excludedIngredients')).toBe(', ');
    expect(mealPlanFieldUI.resolve('notes')).toBe('\n');
  });

  it('returns undefined for non-additive fields', () => {
    expect(mealPlanFieldUI.resolve('servings')).toBeUndefined();
    expect(mealPlanFieldUI.resolve('maxTotalTimeMinutes')).toBeUndefined();
    expect(mealPlanFieldUI.resolve('planLength')).toBeUndefined();
    expect(mealPlanFieldUI.resolve('dietaryPattern')).toBeUndefined();
    expect(mealPlanFieldUI.resolve('skillLevel')).toBeUndefined();
    expect(mealPlanFieldUI.resolve('budgetPreference')).toBeUndefined();
    expect(mealPlanFieldUI.resolve('leftoverPreference')).toBeUndefined();
    expect(mealPlanFieldUI.resolve('allergens')).toBeUndefined();
    expect(mealPlanFieldUI.resolve('preferredCuisines')).toBeUndefined();
    expect(mealPlanFieldUI.resolve('preferredProteins')).toBeUndefined();
    expect(mealPlanFieldUI.resolve('availableEquipment')).toBeUndefined();
    expect(mealPlanFieldUI.resolve('excludedRecipeIds')).toBeUndefined();
    expect(mealPlanFieldUI.resolve('maxActivePrepMinutes')).toBeUndefined();
  });

  it('isVoiceAppend returns true for additive fields', () => {
    expect(mealPlanFieldUI.isVoiceAppend('pantryIngredients')).toBe(true);
    expect(mealPlanFieldUI.isVoiceAppend('useSoonIngredients')).toBe(true);
    expect(mealPlanFieldUI.isVoiceAppend('excludedIngredients')).toBe(true);
    expect(mealPlanFieldUI.isVoiceAppend('notes')).toBe(true);
  });

  it('isVoiceAppend returns false for non-additive fields', () => {
    expect(mealPlanFieldUI.isVoiceAppend('servings')).toBe(false);
    expect(mealPlanFieldUI.isVoiceAppend('planLength')).toBe(false);
    expect(mealPlanFieldUI.isVoiceAppend('allergens')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Pantry field UI
// ---------------------------------------------------------------------------

describe('pantryFieldUI', () => {
  it('annotates `note` as a paragraph field', () => {
    expect(pantryFieldUI.resolve('note')).toBe(PARAGRAPH_SEPARATOR);
    expect(pantryFieldUI.isVoiceAppend('note')).toBe(true);
  });

  it('leaves other PantryItem fields unannotated', () => {
    expect(pantryFieldUI.resolve('name')).toBeUndefined();
    expect(pantryFieldUI.resolve('quantity')).toBeUndefined();
    expect(pantryFieldUI.isVoiceAppend('id')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Recipe field UI
// ---------------------------------------------------------------------------

describe('recipeFieldUI', () => {
  it('annotates `leftoverInstructions` as a paragraph field', () => {
    expect(recipeFieldUI.resolve('leftoverInstructions')).toBe(
      PARAGRAPH_SEPARATOR,
    );
    expect(recipeFieldUI.isVoiceAppend('leftoverInstructions')).toBe(true);
  });

  it('leaves non-prose Recipe fields unannotated', () => {
    expect(recipeFieldUI.resolve('name')).toBeUndefined();
    expect(recipeFieldUI.resolve('servings')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Shopping-list field UI
// ---------------------------------------------------------------------------

describe('shoppingListFieldUI', () => {
  it('annotates `preparationNote` as a paragraph field', () => {
    expect(shoppingListFieldUI.resolve('preparationNote')).toBe(
      PARAGRAPH_SEPARATOR,
    );
    expect(shoppingListFieldUI.isVoiceAppend('preparationNote')).toBe(true);
  });

  it('leaves non-free-text ShoppingListItem fields unannotated', () => {
    expect(shoppingListFieldUI.resolve('name')).toBeUndefined();
    expect(shoppingListFieldUI.resolve('quantity')).toBeUndefined();
    expect(shoppingListFieldUI.isVoiceAppend('isChecked')).toBe(false);
  });
});
