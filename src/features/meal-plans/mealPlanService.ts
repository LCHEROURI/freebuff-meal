/**
 * Service layer for meal-plans. Uses Cloud Functions when configured; falls
 * back to a deterministic local library in demo mode so the UX is
 * walkable without Firebase credentials.
 */
import { httpsCallable } from 'firebase/functions';

import { getFirebaseAuth, getFunctionsInstance } from '@/lib/firebase/app';
import { isFirebaseConfigured } from '@/lib/env';
import { useAuth } from '@/features/auth/authContext';

import { fallbackPlan } from './dishLibrary';
import type {
  MealPlan,
  MealPlanGenerationInput,
  EmbeddedRecipe,
} from '@/schemas/mealPlan';

type ServiceContext = { uid: string; demoMode: boolean };

export const generatePlan = async (
  input: MealPlanGenerationInput,
  _ctx: ServiceContext,
): Promise<EmbeddedRecipe[]> => {
  void _ctx;
  if (!isFirebaseConfigured()) {
    await new Promise((r) => setTimeout(r, 1200));
    const recipes = fallbackPlan(input);
    return recipes.map((r, idx) => ({ ...r, order: idx }));
  }

  const auth = getFirebaseAuth();
  if (!auth?.currentUser) {
    throw new Error('Sign in to generate a meal plan.');
  }
  const fns = getFunctionsInstance();
  if (!fns) throw new Error('Backend unavailable.');
  const call = httpsCallable<MealPlanGenerationInput, { plan: MealPlan }>(
    fns,
    'generateMealPlanFlow',
  );
  const result = await call(input);
  return result.data.plan.recipes.map((r, idx) => ({ ...r, order: idx }));
};

/**
 * Regenerate all unlocked recipes in a plan while preserving
 * `lockedRecipeIds`. Returns recipes for the *new* plan (locked entries
 * from the original passed in remain).
 */
export const regenerateAllPlan = async (
  locked: EmbeddedRecipe[],
  input: MealPlanGenerationInput,
): Promise<EmbeddedRecipe[]> => {
  if (!isFirebaseConfigured()) {
    await new Promise((r) => setTimeout(r, 1200));
    const fresh = fallbackPlan(input).filter(
      (r) => !locked.some((l) => l.id === r.id),
    );
    const newOnes: EmbeddedRecipe[] = fresh.slice(0, input.planLength - locked.length).map(
      (r, idx) => ({ ...r, order: locked.length + idx }),
    );
    return [...locked, ...newOnes];
  }

  const fns = getFunctionsInstance();
  if (!fns) throw new Error('Backend unavailable.');
  const call = httpsCallable<
    MealPlanGenerationInput,
    { plan: MealPlan }
  >(fns, 'generateMealPlanFlow');
  const excluded = locked.map((r) => r.id);
  const result = await call({
    ...input,
    excludedRecipeIds: excluded,
  });
  const fresh = result.data.plan.recipes.map((r, idx) => ({ ...r, order: idx }));
  // Re-anchor the locked recipes at the front of the order list.
  return [...locked, ...fresh.filter((r) => !locked.some((l) => l.id === r.id))].slice(
    0,
    input.planLength,
  );
};

export type RegenerationReason =
  | 'faster'
  | 'cheaper'
  | 'different_cuisine'
  | 'different_protein'
  | 'fewer_ingredients'
  | 'more_familiar'
  | 'use_more_pantry'
  | 'avoid_ingredient';

export const regenerateRecipe = async (
  planId: string,
  recipeId: string,
  reason: RegenerationReason,
  detail: string | undefined,
  lockList: string[],
  profile: {
    preferredCuisines: string[];
    preferredProteins: string[];
    maxTotalTimeMinutes: number;
    allergens: string[];
    excludedIngredients: string[];
  },
): Promise<EmbeddedRecipe> => {
  if (!isFirebaseConfigured()) {
    await new Promise((r) => setTimeout(r, 600));
    const library = fallbackPlan({
      planLength: 5,
      servings: 2,
      maxTotalTimeMinutes: profile.maxTotalTimeMinutes,
      dietaryPattern: 'none',
      allergens: profile.allergens as never,
      excludedIngredients: profile.excludedIngredients,
      preferredCuisines: profile.preferredCuisines,
      preferredProteins: profile.preferredProteins,
      pantryIngredients: [],
      useSoonIngredients: [],
      availableEquipment: ['Stovetop', 'Oven'],
      skillLevel: 'intermediate',
      budgetPreference: 'everyday',
      leftoverPreference: 'some',
      notes: detail ?? '',
      excludedRecipeIds: [],
    });
    const excludedIds = new Set([recipeId, ...lockList]);
    const next = library.find((r) => !excludedIds.has(r.id)) ?? library[0];
    // Keep the *original* recipe id so subsequent lock comparisons still work.
    return { ...next, order: 999, id: recipeId };
  }

  const fns = getFunctionsInstance();
  if (!fns) throw new Error('Backend unavailable.');
  const call = httpsCallable<
    { planId: string; recipeId: string; reason: string; detail?: string; lockedRecipeIds: string[] },
    { recipe: EmbeddedRecipe }
  >(fns, 'regenerateRecipeFlow');
  const result = await call({
    planId,
    recipeId,
    reason,
    detail,
    lockedRecipeIds: lockList,
  });
  // Server promised the AI keeps id stable; we still assert it for clarity.
  return { ...result.data.recipe, id: recipeId };
};

// Convenience hook-bridge so React components stay declarative.
export const usePlanService = () => {
  const { user, isDemo } = useAuth();
  return {
    uid: user?.uid ?? 'anonymous',
    demoMode: isDemo,
    generatePlan: (input: MealPlanGenerationInput) =>
      generatePlan(input, { uid: user?.uid ?? 'anonymous', demoMode: isDemo }),
    regenerateAllPlan: (locked: EmbeddedRecipe[], input: MealPlanGenerationInput) =>
      regenerateAllPlan(locked, input),
    regenerateRecipe: (
      planId: string,
      recipeId: string,
      reason: RegenerationReason,
      detail: string | undefined,
      lockList: string[],
      profile: {
        preferredCuisines: string[];
        preferredProteins: string[];
        maxTotalTimeMinutes: number;
        allergens: string[];
        excludedIngredients: string[];
      },
    ) => regenerateRecipe(planId, recipeId, reason, detail, lockList, profile),
  };
};
