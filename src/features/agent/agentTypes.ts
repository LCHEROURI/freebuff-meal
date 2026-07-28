/**
 * Client-mirrored types for the cooking-agent layer.
 *
 * The canonical schema lives in `functions/src/agent/schemas.ts` —
 * we mirror it here (using TypeScript-only types, not Zod) so the
 * client side parses its responses without pulling zod into the
 * bundle as runtime-validation. They must stay in lockstep with
 * the schemas module — drift is caught at typecheck.
 */

export type AgentIngredient = {
  name: string;
  quantity: number | null;
  unit: string | null;
  condition: 'fresh' | 'frozen' | 'cooked' | 'leftover' | 'canned' | 'dried' | 'other' | null;
  confidence: number;
};

export type Equipment =
  | 'stove'
  | 'oven'
  | 'air_fryer'
  | 'slow_cooker'
  | 'instant_pot'
  | 'rice_cooker'
  | 'microwave'
  | 'grill'
  | 'blender'
  | 'food_processor';

export type CookingSessionPhase =
  | 'IDLE'
  | 'COLLECTING_INGREDIENTS'
  | 'CONFIRMING_INGREDIENTS'
  | 'COLLECTING_REQUIREMENTS'
  | 'GENERATING_RECIPE'
  | 'VALIDATING_RECIPE'
  | 'RECIPE_READY'
  | 'PREP_GUIDANCE'
  | 'COOKING_GUIDANCE'
  | 'PLATING'
  | 'WAITING_FOR_TIMER'
  | 'PAUSED'
  | 'SUBSTITUTION_REQUIRED'
  | 'USER_CORRECTION'
  | 'COMPLETED'
  | 'ERROR_RECOVERY';

export type CookingSession = {
  id: string;
  ownerId: string;
  status: 'active' | 'paused' | 'completed' | 'abandoned' | 'error';
  phase: CookingSessionPhase;
  currentStepIndex: number;
  recipeId: string | null;
  ingredients: AgentIngredient[];
  servings: number;
  maximumMinutes: number;
  equipment: Equipment[];
  startedAt: string;
  lastActivityAt: string;
  completedAt: string | null;
  previousPhaseBeforePause: CookingSessionPhase | null;
};
