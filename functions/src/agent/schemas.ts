/**
 * Cooking-agent tool schemas.
 *
 * Mirrors the user-facing spec for the voice-operated cooking agent
 * (Version 1 + Version 2). Each schema is the contract between the
 * client (browser-side wrapper) and the onCall handler — keeping
 * them in one place makes mismatches loud at compile time.
 *
 * Only `EnrichedRecipeSchema` and `CookingSessionSchema` flow into
 * Firestore; everything else is request/response shape.
 */
import { z } from 'zod';

/** Structured ingredient as the agent extracts from natural speech. */
export const AgentIngredientSchema = z.object({
  name: z.string().min(1).max(80),
  quantity: z.number().positive().nullable(),
  unit: z.string().min(1).max(40).nullable(),
  condition: z
    .enum(['fresh', 'frozen', 'cooked', 'leftover', 'canned', 'dried', 'other'])
    .nullable()
    .default(null),
  /** How confident the extractor is. Below threshold the agent should ask. */
  confidence: z.number().min(0).max(1).default(0.6),
});
export type AgentIngredient = z.infer<typeof AgentIngredientSchema>;

/** Equipment strings the user might mention in speech. */
export const EquipmentEnum = z.enum([
  'stove',
  'oven',
  'air_fryer',
  'slow_cooker',
  'instant_pot',
  'rice_cooker',
  'microwave',
  'grill',
  'blender',
  'food_processor',
]);
export type Equipment = z.infer<typeof EquipmentEnum>;

/** ----------------------------------------------------------------
 *  save_available_ingredients
 *  ---------------------------------------------------------------*/
export const SaveAvailableIngredientsRequestSchema = z.object({
  ingredients: z.array(AgentIngredientSchema).min(1).max(40),
});
export const SaveAvailableIngredientsResponseSchema = z.object({
  ingredients: z.array(AgentIngredientSchema),
  warnings: z.array(z.string()).default([]),
  savedAt: z.string().datetime(),
});

/** ----------------------------------------------------------------
 *  update_available_ingredients
 *  ---------------------------------------------------------------*/
export const UpdateAvailableIngredientsRequestSchema = z.object({
  /** Add by ingredient (idempotent on `name`), remove by index, correct
   *  by index for in-place edits. */
  add: z.array(AgentIngredientSchema).max(20).optional().default([]),
  removeIndexes: z.array(z.number().int().nonnegative()).max(20).optional().default([]),
  replaceIndexes: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        ingredient: AgentIngredientSchema,
      }),
    )
    .max(20)
    .optional()
    .default([]),
});
export const UpdateAvailableIngredientsResponseSchema =
  SaveAvailableIngredientsResponseSchema;

/** ----------------------------------------------------------------
 *  generate_recipe — wraps the existing `generateMealPlanFlow`
 *  ---------------------------------------------------------------*/
export const GenerateRecipeRequestSchema = z.object({
  ingredients: z.array(AgentIngredientSchema).min(1).max(40),
  servings: z.number().int().min(1).max(12),
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).default('dinner'),
  maximumMinutes: z.number().int().min(15).max(180),
  equipment: z.array(EquipmentEnum).max(10).optional().default([]),
  dietaryRestrictions: z
    .array(
      z.enum([
        'vegetarian',
        'vegan',
        'pescatarian',
        'gluten_free',
        'dairy_free',
        'low_carb',
        'halal_friendly',
        'kosher_style',
        'nut_free',
      ]),
    )
    .max(10)
    .optional()
    .default([]),
  allergens: z.array(z.string().max(40)).max(20).optional().default([]),
  /** Plan length is 1 for "I just want THIS dish". The default surfaces
   *  a single recipe (the existing flow is plan-shaped so we use 1 as
   *  a sentinel and slice the first recipe out). */
  planLength: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(7)]).default(1),
  pantryConfidence: z.array(z.string().max(80)).max(40).optional().default([]),
});
export const GenerateRecipeResponseSchema = z.object({
  /** A structured recipe the agent can speak one step at a time. */
  recipe: z.object({
    id: z.string(),
    name: z.string(),
    shortDescription: z.string(),
    cuisine: z.string(),
    servings: z.number().int().positive(),
    prepMinutes: z.number().int().nonnegative(),
    cookMinutes: z.number().int().nonnegative(),
    ingredients: z.array(AgentIngredientSchema),
    prepSteps: z.array(
      z.object({
        stepNumber: z.number().int().positive(),
        instruction: z.string(),
        spokenInstruction: z.string(),
        estimatedSeconds: z.number().int().positive(),
      }),
    ),
    cookingSteps: z.array(
      z.object({
        stepNumber: z.number().int().positive(),
        instruction: z.string(),
        spokenInstruction: z.string(),
        timerSeconds: z.number().int().positive().nullable(),
        temperature: z.string().nullable(),
        ingredientsUsed: z.array(z.string()),
        safetyCritical: z.boolean().default(false),
      }),
    ),
    safety: z.object({
      minimumInternalTemperatureF: z.number().int().positive().nullable(),
    }),
  }),
  unknownIngredients: z.array(z.string()).default([]),
});

/** ----------------------------------------------------------------
 *  validate_recipe — sanity-check generated recipe completeness
 *  ---------------------------------------------------------------*/
export const ValidateRecipeRequestSchema = z.object({
  recipe: GenerateRecipeResponseSchema.shape.recipe,
  equipment: z.array(EquipmentEnum).max(10).optional().default([]),
  dietaryRestrictions: z
    .array(z.string().max(40))
    .max(10)
    .optional()
    .default([]),
});
export const ValidateRecipeResponseSchema = z.object({
  ok: z.boolean(),
  issues: z.array(
    z.object({
      severity: z.enum(['error', 'warning', 'info']),
      message: z.string(),
    }),
  ),
});

/** ----------------------------------------------------------------
 *  Persisted cooking-session shape (Firestore `cookingSessions/{sid}`)
 *  ---------------------------------------------------------------*/
export const CookingSessionPhaseSchema = z.enum([
  'IDLE',
  'COLLECTING_INGREDIENTS',
  'CONFIRMING_INGREDIENTS',
  'COLLECTING_REQUIREMENTS',
  'GENERATING_RECIPE',
  'VALIDATING_RECIPE',
  'RECIPE_READY',
  'PREP_GUIDANCE',
  'COOKING_GUIDANCE',
  'PLATING',
  'WAITING_FOR_TIMER',
  'PAUSED',
  'SUBSTITUTION_REQUIRED',
  'USER_CORRECTION',
  'COMPLETED',
  'ERROR_RECOVERY',
]);
export type CookingSessionPhase = z.infer<typeof CookingSessionPhaseSchema>;

export const CookingSessionSchema = z.object({
  id: z.string().min(1),
  ownerId: z.string().min(1),
  status: z.enum(['active', 'paused', 'completed', 'abandoned', 'error']),
  phase: CookingSessionPhaseSchema,
  currentStepIndex: z.number().int().nonnegative(),
  recipeId: z.string().min(1).nullable(),
  ingredients: z.array(AgentIngredientSchema),
  servings: z.number().int().min(1).max(12),
  maximumMinutes: z.number().int().min(15).max(180),
  equipment: z.array(EquipmentEnum),
  startedAt: z.string().datetime(),
  lastActivityAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  /**
   * Set to the phase the cook was in when they paused. Used to
   * restore the same phase after resume (avoids "I paused mid-prep
   * and now I'm jumped into cooking" surprises). Cleared to null on
   * resume.
   */
  previousPhaseBeforePause: CookingSessionPhaseSchema.nullable().default(null),
});
export type CookingSession = z.infer<typeof CookingSessionSchema>;

/** ----------------------------------------------------------------
 *  start_cooking_session
 *  ---------------------------------------------------------------*/
export const StartCookingSessionRequestSchema = z.object({
  ingredients: z.array(AgentIngredientSchema).min(1).max(40),
  servings: z.number().int().min(1).max(12),
  maximumMinutes: z.number().int().min(15).max(180),
  equipment: z.array(EquipmentEnum).max(10).optional().default([]),
  dietaryRestrictions: z.array(z.string().max(40)).max(10).optional().default([]),
  /** Optional pre-generated recipe (skips the recipe-generation step). */
  prefabRecipeId: z.string().optional(),
});
export const StartCookingSessionResponseSchema = z.object({
  session: CookingSessionSchema,
  recipe: GenerateRecipeResponseSchema.shape.recipe,
});

/** ----------------------------------------------------------------
 *  get_current_step / complete_current_step / repeat_current_step / previous_step
 *  ---------------------------------------------------------------*/
export const GetCurrentStepRequestSchema = z.object({ sessionId: z.string().min(1) });
export const GetCurrentStepResponseSchema = z.object({
  session: CookingSessionSchema,
  step: z.object({
    stepNumber: z.number().int().positive(),
    phase: z.enum(['preparation', 'cooking', 'presentation']),
    text: z.string(),
    spokenText: z.string(),
    timerSeconds: z.number().int().positive().nullable(),
    ingredientsUsed: z.array(z.string()),
    safetyCritical: z.boolean(),
  }),
  totalSteps: z.number().int().positive(),
});

export const CompleteCurrentStepRequestSchema = z.object({ sessionId: z.string().min(1) });
export const CompleteCurrentStepResponseSchema = z.object({
  session: CookingSessionSchema,
  step: GetCurrentStepResponseSchema.shape.step.nullable(),
  totalSteps: z.number().int().positive(),
});

export const RepeatCurrentStepRequestSchema = GetCurrentStepRequestSchema;
export const RepeatCurrentStepResponseSchema = GetCurrentStepResponseSchema;

export const PreviousStepRequestSchema = GetCurrentStepRequestSchema;
export const PreviousStepResponseSchema = CompleteCurrentStepResponseSchema;

/** ----------------------------------------------------------------
 *  replace_ingredient — substitution flow
 *  ---------------------------------------------------------------*/
export const ReplaceIngredientRequestSchema = z.object({
  sessionId: z.string().min(1),
  originalIngredient: z.string().min(1).max(80),
  replacement: z.string().min(1).max(80),
  addedAllergens: z.array(z.string().max(40)).max(10).optional().default([]),
});
export const ReplaceIngredientResponseSchema = z.object({
  session: CookingSessionSchema,
  warning: z.string().nullable(),
  prompt: z.string().nullable(),
});

/** ----------------------------------------------------------------
 *  resize_recipe
 *  ---------------------------------------------------------------*/
export const ResizeRecipeRequestSchema = z.object({
  sessionId: z.string().min(1),
  newServings: z.number().int().min(1).max(12),
});
export const ResizeRecipeResponseSchema = z.object({
  session: CookingSessionSchema,
  recipe: GenerateRecipeResponseSchema.shape.recipe,
});

/** ----------------------------------------------------------------
 *  start_timer / pause_cooking_session / resume_cooking_session / end_cooking_session
 *  ---------------------------------------------------------------*/
export const StartTimerRequestSchema = z.object({
  sessionId: z.string().min(1),
  durationSeconds: z.number().int().positive().max(60 * 60 * 4),
});
export const StartTimerResponseSchema = z.object({
  session: CookingSessionSchema,
  timerId: z.string(),
  startedAt: z.string().datetime(),
});

export const PauseCookingSessionRequestSchema = GetCurrentStepRequestSchema;
export const PauseCookingSessionResponseSchema = z.object({
  session: CookingSessionSchema,
});

export const ResumeCookingSessionRequestSchema = GetCurrentStepRequestSchema;
export const ResumeCookingSessionResponseSchema = PauseCookingSessionResponseSchema;

export const EndCookingSessionRequestSchema = z.object({
  sessionId: z.string().min(1),
  status: z.enum(['completed', 'abandoned']).default('completed'),
});
export const EndCookingSessionResponseSchema = z.object({
  session: CookingSessionSchema,
});

/**
 * The 15 canonical tool names. Kept in one place so the wizard's
 * `agentClient` and the server's onCall map stay aligned.
 */
export const TOOL_NAMES = [
  'save_available_ingredients',
  'update_available_ingredients',
  'generate_recipe',
  'validate_recipe',
  'start_cooking_session',
  'get_current_step',
  'complete_current_step',
  'repeat_current_step',
  'previous_step',
  'replace_ingredient',
  'resize_recipe',
  'start_timer',
  'pause_cooking_session',
  'resume_cooking_session',
  'end_cooking_session',
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];
