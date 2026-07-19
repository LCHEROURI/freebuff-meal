import { z } from 'zod';
import { IngredientSchema, AllergenSchema, DietaryPatternSchema } from './ingredient';

export const AuthenticityLabelSchema = z.enum([
  'traditional',
  'widely_recognized',
  'common_variation',
  'adapted_to_preferences',
]);
export type AuthenticityLabel = z.infer<typeof AuthenticityLabelSchema>;

export const DifficultySchema = z.enum(['easy', 'medium', 'hard']);
export type Difficulty = z.infer<typeof DifficultySchema>;

export const RecipeStepSchema = z.object({
  order: z.number().int().positive(),
  text: z.string().min(1).max(600),
  /** Optional category so we can split prep/cooking/presentation. */
  phase: z.enum(['preparation', 'cooking', 'presentation']).default('cooking'),
});
export type RecipeStep = z.infer<typeof RecipeStepSchema>;

export const RecipeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  shortDescription: z.string().min(1).max(280),
  cuisine: z.string().min(1).max(60),
  originCountry: z.string().min(1).max(60),
  originCountryCode: z
    .string()
    .length(2)
    .regex(/^[A-Z]{2}$/)
    .optional()
    .describe('ISO-3166 alpha-2 code when applicable (e.g. IT, JP, MX).'),
  dishClassification: z
    .enum(['main', 'stew', 'pasta', 'rice', 'noodle', 'salad', 'soup', 'sandwich', 'breakfast_dinner', 'one_pan'])
    .default('main'),
  authenticityLabel: AuthenticityLabelSchema,
  whyItFits: z.string().min(1).max(280),
  prepTimeMinutes: z.number().int().positive(),
  cookTimeMinutes: z.number().int().nonnegative(),
  totalTimeMinutes: z.number().int().positive(),
  servings: z.number().int().positive(),
  difficulty: DifficultySchema,
  equipment: z.array(z.string().min(1).max(60)),
  ingredients: z.array(IngredientSchema).min(1),
  preparationSteps: z.array(RecipeStepSchema).min(1),
  cookingSteps: z.array(RecipeStepSchema).min(1),
  presentationSuggestions: z.array(z.string()).default([]),
  substitutions: z
    .array(
      z.object({
        original: z.string().min(1),
        replacement: z.string().min(1),
        note: z.string().optional(),
      }),
    )
    .default([]),
  leftoverInstructions: z.string().optional(),
  foodSafetyNotes: z.array(z.string()).default([]),
  allergenFlags: z.array(AllergenSchema).default([]),
  dietaryTags: z.array(DietaryPatternSchema).default([]),
  sideDishSuggestion: z
    .object({
      name: z.string(),
      why: z.string().optional(),
    })
    .optional(),
  /**
   * Optional provenance flag. In demo mode this is "demo" so the UI can label
   * generated-by-mock recipes honestly.
   */
  source: z.enum(['vertex_ai', 'demo']).default('vertex_ai'),
});
export type Recipe = z.infer<typeof RecipeSchema>;
