import { describe, expect, it } from 'vitest';

import { fallbackPlan } from '@/features/meal-plans/dishLibrary';
import type { MealPlanGenerationInput } from '@/schemas/mealPlan';

const baseInput: MealPlanGenerationInput = {
  planLength: 5,
  servings: 2,
  maxTotalTimeMinutes: 45,
  dietaryPattern: 'none',
  allergens: [],
  excludedIngredients: [],
  preferredCuisines: [],
  preferredProteins: [],
  pantryIngredients: [],
  useSoonIngredients: [],
  availableEquipment: [],
  skillLevel: 'intermediate',
  budgetPreference: 'everyday',
  leftoverPreference: 'some',
  notes: '',
  excludedRecipeIds: [],
};

describe('fallback plan', () => {
  it('returns up to planLength matching dishes', () => {
    const result = fallbackPlan(baseInput);
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('does not return dishes with allergens', () => {
    const result = fallbackPlan({ ...baseInput, allergens: ['dairy'] });
    for (const r of result) {
      expect(r.allergenFlags).not.toContain('dairy');
    }
  });

  it('honors the time limit loosely', () => {
    const result = fallbackPlan({ ...baseInput, maxTotalTimeMinutes: 25 });
    for (const r of result) {
      expect(r.totalTimeMinutes).toBeLessThanOrEqual(35);
    }
  });

  it('returns at least one dish even when no cuisines match', () => {
    const result = fallbackPlan({ ...baseInput, preferredCuisines: ['Martian'] });
    expect(result.length).toBeGreaterThan(0);
  });

  it('keeps recipes distinct (no duplicates by id)', () => {
    const result = fallbackPlan(baseInput);
    const ids = new Set(result.map((r) => r.id));
    expect(ids.size).toBe(result.length);
  });
});
