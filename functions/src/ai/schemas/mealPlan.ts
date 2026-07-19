import { z } from 'zod';
import {
  AllergenSchema,
  DietaryPatternSchema,
  ShoppingCategorySchema,
  UnitSchema,
} from './ingredient.js';
import { AuthenticityLabelSchema, DifficultySchema, RecipeSchema } from './recipe.js';

/**
 * Shared between the new-plan form and the AI flow's input.
 *
 * The free-text `notes` field is the single largest source of ambiguity; we
 * cap its length to keep API costs predictable and prevent abuse.
 *
 * Important: callers use `MealPlanGenerationInput` (the *input* type)
 * which makes the default-populated fields truly optional. Parsed output
 * (`z.infer` of the schema) returns the post-default shape used server-side
 * after validation.
 */
export const MealPlanGenerationInputSchema = z.object({
  planLength: z.union([z.literal(3), z.literal(5), z.literal(7)]),
  servings: z.number().int().min(1).max(12),
  maxTotalTimeMinutes: z.number().int().min(15).max(180),
  maxActivePrepMinutes: z.number().int().min(5).max(90).optional(),
  dietaryPattern: DietaryPatternSchema,
  allergens: z.array(AllergenSchema).max(40).optional().default([]),
  excludedIngredients: z.array(z.string().max(60)).max(40).optional().default([]),
  preferredCuisines: z.array(z.string().max(40)).max(10).optional().default([]),
  preferredProteins: z.array(z.string().max(40)).max(10).optional().default([]),
  pantryIngredients: z.array(z.string().max(60)).max(40).optional().default([]),
  useSoonIngredients: z.array(z.string().max(60)).max(10).optional().default([]),
  availableEquipment: z.array(z.string().max(40)).max(20).optional().default([]),
  skillLevel: z.enum(['beginner', 'intermediate', 'advanced']),
  budgetPreference: z.enum(['everyday', 'moderate', 'splurge']),
  leftoverPreference: z.enum(['none', 'some', 'lots']).optional().default('some'),
  notes: z.string().max(2000).optional().default(''),
  // Recipe ids the AI must not duplicate in the generated plan. Used by the
  // "regenerate full plan" flow to honour locked recipes.
  excludedRecipeIds: z.array(z.string().max(80)).max(40).optional().default([]),
});
/** Input-shape type — fields with defaults are truly optional here. */
export type MealPlanGenerationInput = z.input<typeof MealPlanGenerationInputSchema>;
/** Output-shape type — every default field has been filled in. */
export type MealPlanGenerationValidated = z.output<typeof MealPlanGenerationInputSchema>;

/**
 * The full plan returned by the AI flow. Distinct from the persisted record
 * because we don't store generation metadata on the public client.
 */
export const MealPlanSchema = z.object({
  summary: z.string().min(1).max(400),
  planLength: z.number().int().min(1).max(7),
  recipes: z.array(RecipeSchema).min(1).max(7),
  // We persist the validated (post-default) shape here — keeps the snapshot
  // round-trippable.
  input: MealPlanGenerationInputSchema,
  generationMetadata: z.object({
    modelName: z.string(),
    promptVersion: z.string(),
    generatedAt: z.string().datetime(),
    durationMs: z.number().int().nonnegative(),
    retryCount: z.number().int().nonnegative(),
    validation: z.enum(['passed', 'repaired', 'failed']),
  }),
});
export type MealPlan = z.infer<typeof MealPlanSchema>;

/** Recipe with id for in-list rendering; same shape as RecipeSchema. */
export const EmbeddedRecipeSchema = RecipeSchema.extend({
  order: z.number().int().nonnegative(),
});
export type EmbeddedRecipe = z.infer<typeof EmbeddedRecipeSchema>;

/**
 * Minimal regeneration request — the user can ask for a specific swap, or
 * just ask for "faster", "cheaper", etc.
 */
export const RegenerationRequestSchema = z.object({
  planId: z.string(),
  recipeId: z.string(),
  reason: z.enum([
    'faster',
    'cheaper',
    'different_cuisine',
    'different_protein',
    'fewer_ingredients',
    'more_familiar',
    'use_more_pantry',
    'avoid_ingredient',
  ]),
  detail: z.string().max(280).optional(),
  lockedRecipeIds: z.array(z.string()).default([]),
});
export type RegenerationRequest = z.infer<typeof RegenerationRequestSchema>;

/**
 * Generation metadata stored server-side — useful in Cloud Logging but kept
 * off the client's snapshot.
 */
export const GenerationMetadataSchema = z.object({
  modelName: z.string(),
  promptVersion: z.string(),
  generatedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
  retryCount: z.number().int().nonnegative(),
  validationOutcome: z.enum(['passed', 'repaired', 'failed']),
  estimatedRequestBytes: z.number().int().nonnegative(),
  userId: z.string(),
  planId: z.string(),
  generationType: z.enum(['plan', 'recipe']),
});
export type GenerationMetadata = z.infer<typeof GenerationMetadataSchema>;

/** Cause schema used by the re-export. */
export const MealPlanCauseSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

// Re-export for convenience. This avoids deep cross-imports.
export { AllergenSchema, DietaryPatternSchema, ShoppingCategorySchema, UnitSchema, AuthenticityLabelSchema, DifficultySchema };
