import { describe, expect, it } from 'vitest';

import { MealPlanGenerationInputSchema, MealPlanSchema, RecipeSchema, UserProfileSchema } from '@/schemas';

describe('schemas', () => {
  it('accepts a minimal user profile', () => {
    const result = UserProfileSchema.safeParse({
      displayName: 'Demo',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid dietary pattern', () => {
    const result = MealPlanGenerationInputSchema.safeParse({
      planLength: 5,
      servings: 2,
      maxTotalTimeMinutes: 45,
      dietaryPattern: 'paleo' as never,
      skillLevel: 'intermediate',
      budgetPreference: 'everyday',
    });
    expect(result.success).toBe(false);
  });

  it('rejects notes over 2000 chars', () => {
    const result = MealPlanGenerationInputSchema.safeParse({
      planLength: 5,
      servings: 2,
      maxTotalTimeMinutes: 45,
      dietaryPattern: 'none',
      skillLevel: 'intermediate',
      budgetPreference: 'everyday',
      notes: 'a'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it('accepts a kitchen-likely recipe profile string', () => {
    const recipe = RecipeSchema.safeParse({
      id: 'demo',
      name: 'Demo Bowl',
      shortDescription: 'A quick bowl.',
      cuisine: 'Greek',
      originCountry: 'Greece',
      prepTimeMinutes: 5,
      cookTimeMinutes: 10,
      totalTimeMinutes: 15,
      servings: 2,
      difficulty: 'easy',
      equipment: ['Stovetop'],
      ingredients: [
        {
          name: 'Spinach',
          normalizedName: 'spinach',
          quantity: 100,
          unit: 'g',
          category: 'produce',
          displayText: '100 g spinach',
          isOptional: false,
          isPantryItem: false,
          allergenFlags: [],
        },
      ],
      preparationSteps: [{ order: 1, text: 'Wash.', phase: 'preparation' }],
      cookingSteps: [{ order: 1, text: 'Sauté.', phase: 'cooking' }],
      presentationSuggestions: [],
      substitutions: [],
      foodSafetyNotes: [],
      allergenFlags: [],
      dietaryTags: [],
      authenticityLabel: 'traditional',
      whyItFits: 'Quick Greek-inspired bowl.',
      dishClassification: 'main',
    });
    expect(recipe.success).toBe(true);
  });

  it('rejects a malformed meal plan with no recipes', () => {
    const result = MealPlanSchema.safeParse({
      summary: 'empty',
      planLength: 5,
      recipes: [],
      input: {
        planLength: 5,
        servings: 2,
        maxTotalTimeMinutes: 45,
        dietaryPattern: 'none',
        skillLevel: 'intermediate',
        budgetPreference: 'everyday',
      },
      generationMetadata: {
        modelName: 'gemini-3.5-flash',
        promptVersion: 'meal-plan-system-v1',
        generatedAt: new Date().toISOString(),
        durationMs: 1,
        retryCount: 0,
        validation: 'passed',
      },
    });
    expect(result.success).toBe(false);
  });
});
