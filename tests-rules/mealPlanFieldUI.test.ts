import { describe, expect, it } from 'vitest';

import {
  isVoiceAppendMealPlanField,
  MEAL_PLAN_VOICE_SEPARATOR,
  resolveMealPlanVoiceSeparator,
} from '@/lib/mealPlanFieldUI';

describe('MEAL_PLAN_VOICE_SEPARATOR', () => {
  it('has the four expected additive-voice fields with their separators', () => {
    expect(MEAL_PLAN_VOICE_SEPARATOR.pantryIngredients).toBe(', ');
    expect(MEAL_PLAN_VOICE_SEPARATOR.useSoonIngredients).toBe(', ');
    expect(MEAL_PLAN_VOICE_SEPARATOR.excludedIngredients).toBe(', ');
    expect(MEAL_PLAN_VOICE_SEPARATOR.notes).toBe('\n');
  });

  it('does NOT include any non-additive fields', () => {
    // Single-item / numeric / chip-tray fields should be undefined
    // here so the typed `<FormInput/>` keeps their default
    // replace-with-latest-final behavior.
    expect(MEAL_PLAN_VOICE_SEPARATOR.servings).toBeUndefined();
    expect(MEAL_PLAN_VOICE_SEPARATOR.maxTotalTimeMinutes).toBeUndefined();
    expect(MEAL_PLAN_VOICE_SEPARATOR.planLength).toBeUndefined();
    expect(MEAL_PLAN_VOICE_SEPARATOR.dietaryPattern).toBeUndefined();
    expect(MEAL_PLAN_VOICE_SEPARATOR.skillLevel).toBeUndefined();
    expect(MEAL_PLAN_VOICE_SEPARATOR.budgetPreference).toBeUndefined();
    expect(MEAL_PLAN_VOICE_SEPARATOR.leftoverPreference).toBeUndefined();
    expect(MEAL_PLAN_VOICE_SEPARATOR.allergens).toBeUndefined();
    expect(MEAL_PLAN_VOICE_SEPARATOR.preferredCuisines).toBeUndefined();
    expect(MEAL_PLAN_VOICE_SEPARATOR.preferredProteins).toBeUndefined();
    expect(MEAL_PLAN_VOICE_SEPARATOR.availableEquipment).toBeUndefined();
    expect(MEAL_PLAN_VOICE_SEPARATOR.excludedRecipeIds).toBeUndefined();
    expect(MEAL_PLAN_VOICE_SEPARATOR.maxActivePrepMinutes).toBeUndefined();
  });
});

describe('resolveMealPlanVoiceSeparator', () => {
  it('returns the comma-list separator for the three list fields', () => {
    expect(resolveMealPlanVoiceSeparator('pantryIngredients')).toBe(', ');
    expect(resolveMealPlanVoiceSeparator('useSoonIngredients')).toBe(', ');
    expect(resolveMealPlanVoiceSeparator('excludedIngredients')).toBe(', ');
  });

  it('returns the paragraph separator for Notes', () => {
    expect(resolveMealPlanVoiceSeparator('notes')).toBe('\n');
  });

  it('returns undefined for non-additive fields', () => {
    expect(resolveMealPlanVoiceSeparator('servings')).toBeUndefined();
    expect(resolveMealPlanVoiceSeparator('dietaryPattern')).toBeUndefined();
  });
});

describe('isVoiceAppendMealPlanField', () => {
  it('returns true for additive fields', () => {
    expect(isVoiceAppendMealPlanField('pantryIngredients')).toBe(true);
    expect(isVoiceAppendMealPlanField('useSoonIngredients')).toBe(true);
    expect(isVoiceAppendMealPlanField('excludedIngredients')).toBe(true);
    expect(isVoiceAppendMealPlanField('notes')).toBe(true);
  });

  it('returns false for non-additive fields', () => {
    expect(isVoiceAppendMealPlanField('servings')).toBe(false);
    expect(isVoiceAppendMealPlanField('maxTotalTimeMinutes')).toBe(false);
    expect(isVoiceAppendMealPlanField('planLength')).toBe(false);
    expect(isVoiceAppendMealPlanField('allergens')).toBe(false);
  });
});
