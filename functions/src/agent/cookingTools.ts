/**
 * The 15 cooking-agent tools as `onCall` HttpsError-wrapped handlers.
 *
 * Most tools are thin: identity check, parse with Zod, transition
 * state via the pure state machine, Firestore CRUD, log-event.
 *
 * `generate_recipe` is the one that talks to the LLM — it shells out
 * to the same `ai.generate` + `MealPlanSchema` contract that the
 * existing `generateMealPlanFlow` uses, then slices `recipes[0]` out
 * of the validated plan and remaps it to the agent's single-recipe
 * shape. Sharing the schema means the V2 affordances (per-step
 * timers, honest substitution ratios) flow through unchanged.
 *
 * Rate-limit reuse: `checkRateLimit(uid, 'plan')` so an agent-driven
 * recipe counts against the user's daily plan quota — consistent
 * with the rest of the app.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import { z } from 'zod';

import { ai } from '../index.js';
import { gemini20Flash } from '@genkit-ai/vertexai';
import { checkRateLimit } from '../rate-limits/usage.js';
import { PROMPT_VERSION, SYSTEM_PROMPT_V2 } from '../ai/prompts/system.js';
import { MealPlanSchema } from '../ai/schemas/mealPlan.js';

import {
  AgentIngredientSchema,
  AskChefRequestSchema,
  AskChefResponseSchema,
  GenerateRecipeResponseSchema,
  ParseTimerUtteranceRequestSchema,
  ParseTimerUtteranceResponseSchema,
  StartCookingSessionResponseSchema,
  type AgentIngredient,
  type CookingSession,
  type CookingSessionPhase,
} from './schemas.js';
import {
  createSession,
  getSession,
  logEvent as dbLogEvent,
  updateSession,
} from './sessionStore.js';
import {
  IllegalTransitionError,
  nextStepPhase,
  pausePreservePhase,
  prevStepPhase,
  transition,
} from './stateMachine.js';

/**
 * Defensive transition helper — wraps the pure `transition()` so that
 * unexpected phase × trigger pairs (e.g. `SUBSTITUTION_REQUESTED`
 * fired from `RECIPE_READY`) bounce back to the current phase
 * instead of 500-ing the onCall. The wizard's UI gates these
 * buttons to cook-mode phases today, so the catch is purely
 * future-proofing for "a future PR sticks a Substitute button on
 * the RECIPE_READY screen" without re-introducing a runtime crash.
 */
const safeTransition = (
  current: CookingSessionPhase,
  trigger: Parameters<typeof transition>[1],
): CookingSessionPhase => {
  try {
    return transition(current, trigger);
  } catch (err) {
    if (err instanceof IllegalTransitionError) return current;
    throw err;
  }
};

const apiKey = defineSecret('GOOGLE_API_KEY');
const ALL_TOOL_GUARD = { enforceAppCheck: true, secrets: [apiKey] };

const COLLECTION = 'cookingSessions';
const STATE_COLLECTION = 'state';
const RECIPE_DOC = 'currentRecipe';

// =====================================================================
//  Shared helpers
// =====================================================================

const requireUid = (req: { auth?: { uid?: string } }): string => {
  const uid = req.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in to use the cooking agent.');
  }
  return uid;
};

const newSessionId = (uid: string): string => {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `cook_${uid.slice(0, 6)}_${t}_${r}`;
};

const logEvent = (
  sessionId: string,
  eventType: Parameters<typeof dbLogEvent>[1]['eventType'],
  actor: Parameters<typeof dbLogEvent>[1]['actor'],
  payload?: Record<string, unknown>,
): void => {
  // Fire-and-forget — logging must never break the user-visible tool call.
  dbLogEvent(sessionId, { eventType, actor, payload }).catch((err: unknown) => {
    console.warn(`[cookingTools] logEvent(${eventType}) failed`, err);
  });
};

/**
 * Persist the current recipe into a subdocument so the client doesn't
 * need to reconstruct it from event logs across a refresh. The agent's
 * UI re-reads this on resume.
 */
const persistRecipe = (
  sessionId: string,
  recipe: unknown,
): void => {
  getFirestore()
    .collection(COLLECTION)
    .doc(sessionId)
    .collection(STATE_COLLECTION)
    .doc(RECIPE_DOC)
    .set({
      recipe,
      promptVersion: PROMPT_VERSION,
      generatedAt: new Date().toISOString(),
    })
    .catch((err: unknown) => {
      console.warn('[cookingTools] persistRecipe failed', err);
    });
};

const loadPersistedRecipe = async (
  sessionId: string,
): Promise<z.infer<typeof GenerateRecipeResponseSchema.shape.recipe> | null> => {
  const doc = await getFirestore()
    .collection(COLLECTION)
    .doc(sessionId)
    .collection(STATE_COLLECTION)
    .doc(RECIPE_DOC)
    .get();
  if (!doc.exists) return null;
  const r = doc.data()?.recipe;
  const ok = GenerateRecipeResponseSchema.shape.recipe.safeParse(r);
  return ok.success ? ok.data : null;
};

const ensureSessionForInput = async (
  uid: string,
  ingredients: AgentIngredient[],
): Promise<CookingSession> => {
  // Look for an in-flight session in the pre-cook phases; resume its
  // ingredient list rather than create a duplicate session.
  const snap = await getFirestore()
    .collection(COLLECTION)
    .where('ownerId', '==', uid)
    .where('status', 'in', ['active', 'paused'])
    .orderBy('lastActivityAt', 'desc')
    .limit(1)
    .get();

  if (!snap.empty) {
    const existing = snap.docs[0].data() as CookingSession;
    if (
      existing.phase === 'IDLE' ||
      existing.phase === 'COLLECTING_INGREDIENTS' ||
      existing.phase === 'CONFIRMING_INGREDIENTS' ||
      existing.phase === 'COLLECTING_REQUIREMENTS'
    ) {
      return updateSession(existing.id, {
        ingredients,
        phase: transition(existing.phase, 'USER_CONFIRMS_INGREDIENTS'),
      });
    }
  }

  const id = newSessionId(uid);
  const now = new Date().toISOString();
  const fresh: CookingSession = {
    id,
    ownerId: uid,
    status: 'active',
    phase: 'COLLECTING_INGREDIENTS',
    currentStepIndex: 0,
    recipeId: null,
    ingredients,
    servings: 2,
    maximumMinutes: 45,
    equipment: [],
    startedAt: now,
    lastActivityAt: now,
    completedAt: null,
    previousPhaseBeforePause: null,
  };
  await createSession(fresh);
  return fresh;
};

// =====================================================================
//  save_available_ingredients
// =====================================================================

export const saveAvailableIngredients = onCall(ALL_TOOL_GUARD, async (req) => {
  const uid = requireUid(req);
  const input = z
    .object({ ingredients: z.array(AgentIngredientSchema).min(1).max(40) })
    .parse(req.data);

  const session = await ensureSessionForInput(uid, input.ingredients);

  logEvent(session.id, 'INGREDIENTS_SAVED', 'user', {
    count: input.ingredients.length,
  });

  return {
    ingredients: input.ingredients,
    warnings: [],
    savedAt: new Date().toISOString(),
    sessionId: session.id,
  };
});

// =====================================================================
//  update_available_ingredients
// =====================================================================

export const updateAvailableIngredients = onCall(ALL_TOOL_GUARD, async (req) => {
  const uid = requireUid(req);
  const input = z
    .object({
      sessionId: z.string().min(1),
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
    })
    .parse(req.data);

  const session = await getSession(uid, input.sessionId);
  if (!session) throw new HttpsError('not-found', 'Session not found.');

  const indices = [...input.removeIndexes].sort((a, b) => b - a);
  let next = [...session.ingredients];
  for (const idx of indices) {
    if (idx < next.length) next.splice(idx, 1);
  }
  const replaced = [...input.replaceIndexes].sort((a, b) => b.index - a.index);
  for (const rep of replaced) {
    if (rep.index < next.length) next[rep.index] = rep.ingredient;
  }
  next.push(...input.add);

  const updated = await updateSession(session.id, { ingredients: next });
  logEvent(session.id, 'INGREDIENTS_UPDATED', 'user', {
    added: input.add.length,
    removed: input.removeIndexes.length,
    replaced: input.replaceIndexes.length,
  });
  return {
    ingredients: updated.ingredients,
    warnings: [],
    savedAt: updated.lastActivityAt,
  };
});

// =====================================================================
//  extract_ingredients_from_speech — fast path used while the agent
//  is mid-dictation so the wizard doesn't have to wait for the LLM
//  twice (extract → save).
// =====================================================================

export const extractIngredientsFromSpeech = onCall(ALL_TOOL_GUARD, async (req) => {
  const uid = requireUid(req);
  const input = z.object({ utterance: z.string().min(1).max(2000) }).parse(req.data);

  const { extractIngredients } = await import('./ingredientExtractor.js');
  const result = await extractIngredients(input.utterance);
  void uid;
  return { ingredients: result.ingredients, warnings: result.warnings };
});

// =====================================================================
//  generate_recipe
// =====================================================================

export const generateRecipe = onCall(ALL_TOOL_GUARD, async (req) => {
  const uid = requireUid(req);
  const input = z
    .object({
      sessionId: z.string().min(1),
      ingredients: z.array(AgentIngredientSchema).min(1).max(40),
      servings: z.number().int().min(1).max(12),
      mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).default('dinner'),
      maximumMinutes: z.number().int().min(15).max(180),
      equipment: z.array(z.string().max(40)).max(10).optional().default([]),
      dietaryRestrictions: z.array(z.string().max(40)).max(10).optional().default([]),
      allergens: z.array(z.string().max(40)).max(20).optional().default([]),
    })
    .parse(req.data);

  await checkRateLimit(uid, 'plan');
  const session = await getSession(uid, input.sessionId);
  if (!session) throw new HttpsError('not-found', 'Session not found.');

  // Bridge to MealPlanGenerationInput. We use the plan shape with
  // `planLength: 1` as a "single dinner" sentinel — the existing V2
  // prompt already covers single-recipe outputs so we don't need a
  // second prompt.
  const planInput = {
    planLength: 1 as const,
    servings: input.servings,
    maxTotalTimeMinutes: input.maximumMinutes,
    dietaryPattern: input.dietaryRestrictions.includes('vegan')
      ? ('vegan' as const)
      : input.dietaryRestrictions.includes('vegetarian')
        ? ('vegetarian' as const)
        : input.dietaryRestrictions.includes('gluten_free')
          ? ('gluten_free' as const)
          : ('none' as const),
    allergens: input.allergens,
    pantryIngredients: input.ingredients.map((i) => i.name),
    availableEquipment: input.equipment,
    skillLevel: 'intermediate' as const,
    budgetPreference: 'everyday' as const,
    notes: input.ingredients
      .map((i) => {
        const q = i.quantity ? `${i.quantity} ` : '';
        const u = i.unit ? `${i.unit} ` : '';
        return `${q}${u}${i.name}`;
      })
      .join(', '),
  };

  const slugRecipe = async (
    temperature: number,
  ): Promise<z.infer<typeof GenerateRecipeResponseSchema.shape.recipe> | null> => {
    const out = await ai.generate({
      model: gemini20Flash,
      prompt: `${SYSTEM_PROMPT_V2}\n\nUSER INPUT:\n${JSON.stringify(planInput)}`,
      output: { schema: MealPlanSchema as unknown as z.ZodTypeAny },
      config: { temperature, maxOutputTokens: 4096 },
    });
    const planParsed = MealPlanSchema.safeParse(out.output);
    if (!planParsed.success || planParsed.data.recipes.length === 0) return null;
    const r = planParsed.data.recipes[0];
    return GenerateRecipeResponseSchema.shape.recipe.parse({
      id: r.id,
      name: r.name,
      shortDescription: r.shortDescription,
      cuisine: r.cuisine,
      servings: r.servings,
      prepMinutes: r.prepTimeMinutes,
      cookMinutes: r.cookTimeMinutes,
      ingredients: r.ingredients.map((ing) => ({
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        condition: null,
        confidence: 0.6,
      })),
      prepSteps: r.preparationSteps.map((s) => ({
        stepNumber: s.order,
        instruction: s.text,
        spokenInstruction: s.text,
        estimatedSeconds: s.durationSeconds ?? 60,
      })),
      cookingSteps: r.cookingSteps.map((s, i) => ({
        stepNumber: r.preparationSteps.length + i + 1,
        instruction: s.text,
        spokenInstruction: s.text,
        timerSeconds: s.durationSeconds ?? null,
        temperature: null,
        ingredientsUsed: r.ingredients.map((ing) => ing.name),
        safetyCritical: /chicken|beef|pork|poultry|fish/i.test(s.text),
      })),
      safety: {
        minimumInternalTemperatureF: r.cookingSteps.some((s) =>
          /chicken|poultry/i.test(s.text),
        )
          ? 165
          : r.cookingSteps.some((s) => /beef|pork/i.test(s.text))
            ? 145
            : null,
      },
    });
  };

  const first = await slugRecipe(0.5);
  if (first) {
    persistRecipe(input.sessionId, first);
    logEvent(input.sessionId, 'RECIPE_GENERATED', 'agent', { recipeId: first.id });
    return { recipe: first, unknownIngredients: [] };
  }
  const second = await slugRecipe(0.3);
  if (second) {
    persistRecipe(input.sessionId, second);
    logEvent(input.sessionId, 'RECIPE_GENERATED', 'agent', { recipeId: second.id, retried: true });
    return { recipe: second, unknownIngredients: [] };
  }
  logEvent(input.sessionId, 'ERROR_OCCURRED', 'system', { where: 'generateRecipe' });
  throw new HttpsError('internal', 'Could not generate a valid recipe.');
});

// =====================================================================
//  validate_recipe
// =====================================================================

export const validateRecipe = onCall(ALL_TOOL_GUARD, async (req) => {
  const input = z
    .object({
      sessionId: z.string().min(1),
      recipe: GenerateRecipeResponseSchema.shape.recipe,
      equipment: z.array(z.string().max(40)).max(10).optional().default([]),
    })
    .parse(req.data);

  const issues: { severity: 'error' | 'warning' | 'info'; message: string }[] = [];

  // 1. Every ingredient used must appear in the recipe ingredient list.
  const declaredNames = new Set(input.recipe.ingredients.map((i) => i.name.toLowerCase()));
  for (const step of input.recipe.cookingSteps) {
    for (const ing of step.ingredientsUsed) {
      if (!declaredNames.has(ing.toLowerCase())) {
        issues.push({
          severity: 'warning',
          message: `Step uses "${ing}" but it isn't in the ingredient list.`,
        });
      }
    }
  }

  // 2. All cooking steps must include an instruction.
  for (const step of input.recipe.cookingSteps) {
    if (!step.instruction || step.instruction.trim() === '') {
      issues.push({ severity: 'error', message: 'Cooking step is missing instructions.' });
    }
  }

  // 3. Required equipment must be available (if equipment was supplied).
  if (input.equipment.length > 0) {
    const eqSet = new Set(input.equipment.map((e) => e.toLowerCase()));
    for (const step of input.recipe.cookingSteps) {
      const txt = step.instruction.toLowerCase();
      if (txt.includes('oven') && !eqSet.has('oven')) {
        issues.push({ severity: 'error', message: 'Recipe needs an oven.' });
      }
      if (txt.includes('air fry') && !eqSet.has('air fryer') && !eqSet.has('air_fryer')) {
        issues.push({ severity: 'error', message: 'Recipe needs an air fryer.' });
      }
    }
  }

  // 4. Safety: any meat step should mention safe cooking temperatures.
  const meatStep = input.recipe.cookingSteps.find((s) =>
    s.instruction.toLowerCase().includes('chicken') ||
    s.instruction.toLowerCase().includes('beef') ||
    s.instruction.toLowerCase().includes('pork'),
  );
  if (meatStep && meatStep.temperature == null) {
    issues.push({
      severity: 'warning',
      message: 'Meat recipe should include safe internal cooking temperatures.',
    });
  }

  logEvent(input.sessionId, 'RECIPE_VALIDATED', 'system', { issueCount: issues.length });
  return { ok: issues.every((i) => i.severity !== 'error'), issues };
});

// =====================================================================
//  start_cooking_session
// =====================================================================

export const startCookingSession = onCall(ALL_TOOL_GUARD, async (req) => {
  const uid = requireUid(req);
  const input = z.object({ sessionId: z.string().min(1) }).parse(req.data);

  const session = await getSession(uid, input.sessionId);
  if (!session) throw new HttpsError('not-found', 'Session not found.');

  const recipe = await loadPersistedRecipe(input.sessionId);
  if (!recipe) {
    throw new HttpsError('failed-precondition', 'No recipe generated for this session yet.');
  }

  const updated = await updateSession(input.sessionId, {
    status: 'active',
    phase: 'PREP_GUIDANCE',
    recipeId: recipe.id,
    currentStepIndex: 0,
    completedAt: null,
  });

  logEvent(input.sessionId, 'COOKING_SESSION_STARTED', 'user', { recipeId: recipe.id });
  return StartCookingSessionResponseSchema.parse({ session: updated, recipe });
});

// =====================================================================
//  get_current_step / complete_current_step / repeat_current_step / previous_step
// =====================================================================

const sessionWithRecipe = async (uid: string, sessionId: string) => {
  const session = await getSession(uid, sessionId);
  if (!session) throw new HttpsError('not-found', 'Session not found.');
  const recipe = await loadPersistedRecipe(sessionId);
  if (!recipe) throw new HttpsError('failed-precondition', 'No recipe loaded.');
  return { session, recipe };
};

type StepView = {
  stepNumber: number;
  phase: 'preparation' | 'cooking' | 'presentation';
  text: string;
  spokenText: string;
  timerSeconds: number | null;
  ingredientsUsed: string[];
  safetyCritical: boolean;
};

const flattenSteps = (
  recipe: z.infer<typeof GenerateRecipeResponseSchema.shape.recipe>,
): StepView[] => {
  const out: StepView[] = [];
  let n = 1;
  for (const s of recipe.prepSteps) {
    out.push({
      stepNumber: n++,
      phase: 'preparation',
      text: s.instruction,
      spokenText: s.spokenInstruction,
      timerSeconds: null,
      ingredientsUsed: [],
      safetyCritical: false,
    });
  }
  for (const s of recipe.cookingSteps) {
    out.push({
      stepNumber: n++,
      phase: 'cooking',
      text: s.instruction,
      spokenText: s.spokenInstruction,
      timerSeconds: s.timerSeconds ?? null,
      ingredientsUsed: s.ingredientsUsed,
      safetyCritical: s.safetyCritical,
    });
  }
  return out;
};

const pickStep = (
  recipe: z.infer<typeof GenerateRecipeResponseSchema.shape.recipe>,
  idx: number,
): StepView | null => {
  const flat = flattenSteps(recipe);
  if (idx < 0 || idx >= flat.length) return null;
  return flat[idx];
};

const totalStepCount = (
  recipe: z.infer<typeof GenerateRecipeResponseSchema.shape.recipe>,
): number => recipe.prepSteps.length + recipe.cookingSteps.length;

export const getCurrentStep = onCall(ALL_TOOL_GUARD, async (req) => {
  const uid = requireUid(req);
  const input = z.object({ sessionId: z.string().min(1) }).parse(req.data);
  const { session, recipe } = await sessionWithRecipe(uid, input.sessionId);
  const step = pickStep(recipe, session.currentStepIndex);
  if (!step) throw new HttpsError('out-of-range', 'No current step.');
  return { session, step, totalSteps: totalStepCount(recipe) };
});

export const completeCurrentStep = onCall(ALL_TOOL_GUARD, async (req) => {
  const uid = requireUid(req);
  const input = z.object({ sessionId: z.string().min(1) }).parse(req.data);
  const { session, recipe } = await sessionWithRecipe(uid, input.sessionId);
  const total = totalStepCount(recipe);
  const nextIdx = Math.min(total - 1, session.currentStepIndex + 1);
  const reachedEnd = nextIdx === total - 1;
  const updated = await updateSession(input.sessionId, {
    currentStepIndex: nextIdx,
    phase: reachedEnd ? 'COMPLETED' : nextStepPhase(session),
    status: reachedEnd ? 'completed' : 'active',
    completedAt: reachedEnd ? new Date().toISOString() : null,
  });
  logEvent(input.sessionId, 'STEP_COMPLETED', 'user', { toIndex: nextIdx });
  const step = reachedEnd ? null : pickStep(recipe, updated.currentStepIndex);
  return { session: updated, step, totalSteps: total };
});

export const repeatCurrentStep = onCall(ALL_TOOL_GUARD, async (req) => {
  const uid = requireUid(req);
  const input = z.object({ sessionId: z.string().min(1) }).parse(req.data);
  const { session, recipe } = await sessionWithRecipe(uid, input.sessionId);
  logEvent(input.sessionId, 'STEP_REPEATED', 'user', { index: session.currentStepIndex });
  const step = pickStep(recipe, session.currentStepIndex);
  return { session, step, totalSteps: totalStepCount(recipe) };
});

export const previousStep = onCall(ALL_TOOL_GUARD, async (req) => {
  const uid = requireUid(req);
  const input = z.object({ sessionId: z.string().min(1) }).parse(req.data);
  const { session, recipe } = await sessionWithRecipe(uid, input.sessionId);
  const prevIdx = Math.max(0, session.currentStepIndex - 1);
  const updated = await updateSession(input.sessionId, {
    currentStepIndex: prevIdx,
    phase: prevStepPhase(session, prevIdx),
  });
  logEvent(input.sessionId, 'STEP_REVERSED', 'user', { toIndex: prevIdx });
  const step = pickStep(recipe, prevIdx);
  return { session: updated, step, totalSteps: totalStepCount(recipe) };
});

// =====================================================================
//  replace_ingredient
// =====================================================================

export const replaceIngredient = onCall(ALL_TOOL_GUARD, async (req) => {
  const uid = requireUid(req);
  const input = z
    .object({
      sessionId: z.string().min(1),
      originalIngredient: z.string().min(1).max(80),
      replacement: z.string().min(1).max(80),
      addedAllergens: z.array(z.string().max(40)).max(10).optional().default([]),
    })
    .parse(req.data);

  const session = await getSession(uid, input.sessionId);
  if (!session) throw new HttpsError('not-found', 'Session not found.');

  const nextPhase = safeTransition(session.phase, 'SUBSTITUTION_REQUESTED');
  const transitioned = await updateSession(input.sessionId, {
    phase: nextPhase,
  });

  logEvent(input.sessionId, 'SUBSTITUTION_REQUESTED', 'user', {
    from: input.originalIngredient,
    to: input.replacement,
  });

  const warning =
    input.addedAllergens.length > 0
      ? `Note: ${input.replacement} introduces ${input.addedAllergens.join(', ')}.`
      : null;

  const prompt = `Confirm: replace ${input.originalIngredient} with ${input.replacement}${
    warning ? ' (' + warning + ')' : ''
  } and continue cooking?`;

  logEvent(input.sessionId, 'SUBSTITUTION_RESOLVED', 'agent', {
    accepted: true,
    replacement: input.replacement,
  });

  return { session: transitioned, warning, prompt };
});

// =====================================================================
//  resize_recipe
// =====================================================================

export const resizeRecipe = onCall(ALL_TOOL_GUARD, async (req) => {
  const uid = requireUid(req);
  const input = z
    .object({
      sessionId: z.string().min(1),
      newServings: z.number().int().min(1).max(12),
    })
    .parse(req.data);
  const session = await getSession(uid, input.sessionId);
  if (!session) throw new HttpsError('not-found', 'Session not found.');

  const recipe = await loadPersistedRecipe(input.sessionId);
  if (!recipe) throw new HttpsError('failed-precondition', 'No recipe loaded.');

  const updated = await updateSession(input.sessionId, { servings: input.newServings });
  return { session: updated, recipe };
});

// =====================================================================
//  start_timer / pause / resume / end
// =====================================================================

export const startTimer = onCall(ALL_TOOL_GUARD, async (req) => {
  const uid = requireUid(req);
  const input = z
    .object({
      sessionId: z.string().min(1),
      durationSeconds: z.number().int().positive().max(60 * 60 * 4),
    })
    .parse(req.data);
  const session = await getSession(uid, input.sessionId);
  if (!session) throw new HttpsError('not-found', 'Session not found.');

  const nextPhase = safeTransition(session.phase, 'TIMER_STARTED');
  const transitioned = await updateSession(input.sessionId, {
    phase: nextPhase,
  });

  const timerId = `timer_${Math.random().toString(36).slice(2, 10)}`;
  logEvent(input.sessionId, 'TIMER_STARTED', 'user', {
    timerId,
    durationSeconds: input.durationSeconds,
  });

  return { session: transitioned, timerId, startedAt: new Date().toISOString() };
});

export const pauseCookingSession = onCall(ALL_TOOL_GUARD, async (req) => {
  const uid = requireUid(req);
  const input = z.object({ sessionId: z.string().min(1) }).parse(req.data);
  const session = await getSession(uid, input.sessionId);
  if (!session) throw new HttpsError('not-found', 'Session not found.');

  const updated = await updateSession(input.sessionId, {
    status: 'paused',
    phase: 'PAUSED',
    previousPhaseBeforePause: pausePreservePhase(session.phase),
  });
  logEvent(input.sessionId, 'SESSION_PAUSED', 'user', {});
  return { session: updated };
});

export const resumeCookingSession = onCall(ALL_TOOL_GUARD, async (req) => {
  const uid = requireUid(req);
  const input = z.object({ sessionId: z.string().min(1) }).parse(req.data);
  const session = await getSession(uid, input.sessionId);
  if (!session) throw new HttpsError('not-found', 'Session not found.');
  if (session.phase !== 'PAUSED') {
    throw new HttpsError('failed-precondition', 'Session is not paused.');
  }

  const resumePhase: CookingSessionPhase | undefined = session.previousPhaseBeforePause ?? undefined;
  const updated = await updateSession(input.sessionId, {
    status: 'active',
    phase: resumePhase ?? 'COOKING_GUIDANCE',
    previousPhaseBeforePause: null,
  });
  logEvent(input.sessionId, 'SESSION_RESUMED', 'user', { toPhase: updated.phase });
  return { session: updated };
});

export const endCookingSession = onCall(ALL_TOOL_GUARD, async (req) => {
  const uid = requireUid(req);
  const input = z
    .object({
      sessionId: z.string().min(1),
      status: z.enum(['completed', 'abandoned']).default('completed'),
    })
    .parse(req.data);
  const session = await getSession(uid, input.sessionId);
  if (!session) throw new HttpsError('not-found', 'Session not found.');
  const updated = await updateSession(input.sessionId, {
    status: input.status,
    phase: input.status === 'abandoned' ? 'IDLE' : 'COMPLETED',
    completedAt: new Date().toISOString(),
  });
  logEvent(
    input.sessionId,
    input.status === 'abandoned' ? 'SESSION_ABANDONED' : 'SESSION_COMPLETED',
    'user',
    {},
  );
  return { session: updated };
});

// =====================================================================
//  ask_chef — CookVoiceOverlay conversational tip loop (PR #15)
//
// Server-side counter-part to the browser's `useSpeechDictation`
// utterance flow. Push-to-talk transcripts that survive the local
// grammar/intent route + the question-shape check land here.
//
// Two non-trivial design choices:
//   1. *Server-side LRU*. The client also caches per-session. The
//      server cache stands for cross-session repeat questions, so
//      a popular "how do I know the chicken is done?" is shared
//      across users for 30 minutes. Bounded so memory leaks are
//      impossible.
//   2. *Strict 25-word output budget* baked into the system prompt.
//      TTS readout is the bottleneck — anything longer hurts
//      comprehension. A validation failure falls back to a graceful
//      canned message rather than 500-ing so the cook never hears
//      silence on a parse hiccup.
// =====================================================================

const ASK_CHEF_SYSTEM_PROMPT = `You are a hands-free kitchen sous-chef speaking to a cook who is mid-recipe.
The cook has just asked a question about the current step.

Hard rules (never break):
1. Keep the spoken answer <= 25 words. The cook is listening while their hands are wet; anything longer is not absorbed.
2. State the practical action BEFORE the explanation.
3. If the question is about safety (doneness, raw meat, allergens), always state the numeric safety threshold (e.g. 165F internal).
4. Never invent ingredient amounts you don't have evidence for; if unsure, say "use a similar amount" rather than a precise number.
5. Do not narrate the question back. Answer only.
6. Use plain conversational English — no bullet lists, no markdown.
7. Return ONLY the JSON object matching the schema. No commentary, no surrounding prose.`;

// Mirrors the client's `normalizeQuestion` so a repeat question from
// either side collapses to the same cache key regardless of who
// computed it first.
const ASK_CHEF_FILLER = new Set([
  'a', 'an', 'the', 'i', 'me', 'my', 'for', 'to', 'of', 'is', 'are',
  'do', 'does', 'can', 'could', 'should', 'would', 'will', 'you', 'know',
]);
const normalizeQuestionForCache = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9\s?']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((t) => t.length > 0 && !ASK_CHEF_FILLER.has(t))
    .join(' ');

const ASK_CHEF_CACHE_MAX = 50;
const ASK_CHEF_CACHE_TTL_MS = 30 * 60 * 1000;
type AskChefCachedValue = z.infer<typeof AskChefResponseSchema>;
const askChefCache = new Map<string, { value: AskChefCachedValue; insertedAt: number }>();
const readAskChefCache = (key: string): AskChefCachedValue | null => {
  const entry = askChefCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.insertedAt > ASK_CHEF_CACHE_TTL_MS) {
    askChefCache.delete(key);
    return null;
  }
  return entry.value;
};
const writeAskChefCache = (key: string, value: AskChefCachedValue): void => {
  if (askChefCache.size >= ASK_CHEF_CACHE_MAX) {
    // Maps preserve insertion order; drop the oldest.
    const oldest = askChefCache.keys().next().value;
    if (oldest !== undefined) askChefCache.delete(oldest);
  }
  askChefCache.set(key, { value, insertedAt: Date.now() });
};

export const askChef = onCall(ALL_TOOL_GUARD, async (req) => {
  const uid = requireUid(req);
  const input = AskChefRequestSchema.parse(req.data);

  // CookVoiceOverlay uses synthetic `cookmode:${planId}:${recipeId}`
  // session ids that don't correspond to a real `cookingSessions/`
  // doc. We accept the call instead of throwing — venting a 404 to
  // the cook mid-recipe is the worst possible UX. The miss is
  // logged so analytics can see when cook-with-me is used.
  const session = await getSession(uid, input.sessionId);
  if (!session) {
    logEvent(input.sessionId, 'AGENT_TOOL_LOG', 'agent', {
      tool: 'ask_chef',
      source: 'overlay',
      note: 'session-not-found',
    });
  }

  // Cache key = `normalizeQuestion(q) + phase`. Deliberately DOES NOT
  // include recipeName — "how do I know the chicken is done" has the
  // same answer regardless of the recipe title, so joining recipeName
  // just wastes slots and reduces cross-recipe hit rate.
  const cacheKey =
    (input.cacheKey ?? normalizeQuestionForCache(input.question)) +
    '|' +
    (input.currentStepPhase ?? 'any');

  const cached = readAskChefCache(cacheKey);
  if (cached) {
    logEvent(input.sessionId, 'AGENT_TOOL_LOG', 'agent', {
      tool: 'ask_chef',
      source: 'cache',
      cacheKey,
    });
    return { ...cached, source: 'cache' as const };
  }

  const prompt =
    `${ASK_CHEF_SYSTEM_PROMPT}\n\n` +
    (input.recipeName ? `RECIPE: ${input.recipeName}\n` : '') +
    (input.currentStepNumber != null && input.currentStepText
      ? `STEP ${input.currentStepNumber} (${input.currentStepPhase ?? 'cooking'}): ${input.currentStepText}\n`
      : '') +
    `COOK'S QUESTION: ${input.question}`;

  const out = await ai.generate({
    model: gemini20Flash,
    prompt,
    output: { schema: AskChefResponseSchema as unknown as z.ZodTypeAny },
    config: { temperature: 0.4, maxOutputTokens: 128 },
  });
  const parsed = AskChefResponseSchema.safeParse(out.output);
  if (!parsed.success) {
    const fallback: AskChefCachedValue = {
      answer:
        'Sorry, I could not think of an answer just now. Try asking once more, slightly differently.',
      followUp: null,
    };
    logEvent(input.sessionId, 'ERROR_OCCURRED', 'system', {
      tool: 'ask_chef',
      reason: 'parse_failed',
    });
    return { ...fallback, source: 'fresh' as const };
  }
  writeAskChefCache(cacheKey, parsed.data);
  logEvent(input.sessionId, 'AGENT_TOOL_LOG', 'agent', {
    tool: 'ask_chef',
    source: 'fresh',
    cacheKey,
    questionLen: input.question.length,
  });
  return { ...parsed.data, source: 'fresh' as const };
});

// =====================================================================
//  parse_timer_utterance — CookVoiceOverlay "start the timer" path
//  (PR #22).
//
// Push-to-talk transcripts that carry any timer cue ("start the
// timer", "set 12 minutes", "I'm putting it in the oven now",
// "thirty seconds", "an hour and a half") land here. The browser
// already extracts most cases via regex (see
// `voiceOverlayGrammar.extractTimerFromUtterance`); the LLM is the
// safety net for ambiguous utterances.
//
// Two design choices worth flagging:
//   1. *Client-side regex FIRST.* The browser calls this onCall
//      only when its own regex returned `kind:'none'` AND the
//      utterance carries a timer cue. Most cases never reach
//      the network.
//   2. *Strict 96-token cap.* Response is a tiny structured object
//      ({action, durationSeconds, source, confidence}), so the LLM
//      is intentionally constrained. End-to-end PTT→action target
//      is <1.5s (Cloud Function warm + Gemini flash ≈ 400–900ms).
// =====================================================================

const TIMER_REGEX_NUMWORD: Readonly<Record<string, number>> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};

const serverParseTimerRegex = (
  utterance: string,
): { durationSeconds: number | null; confidence: number } => {
  const text = utterance.toLowerCase();
  // Special phrases.
  if (/\bquarter\s+hour\b|\ba\s+quarter\s+hour\b/.test(text)) {
    return { durationSeconds: 15 * 60, confidence: 0.95 };
  }
  if (/\bhalf\s+hour\b|\ba\s+half\s+hour\b/.test(text)) {
    return { durationSeconds: 30 * 60, confidence: 0.95 };
  }
  // Numeric + unit.
  const numeric = text.match(
    /\b(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h)\b/,
  );
  if (numeric) {
    const n = Number(numeric[1]!);
    const u = numeric[2]!.toLowerCase();
    const unit: 's' | 'm' | 'h' = u.startsWith('s') || u === 's'
      ? 's'
      : u.startsWith('h') || u === 'h'
        ? 'h'
        : 'm';
    const seconds = unit === 's' ? n : unit === 'm' ? n * 60 : n * 3600;
    return { durationSeconds: Math.min(60 * 60 * 4, Math.max(1, Math.round(seconds))), confidence: 0.95 };
  }
  // Worded numeric + unit.
  for (const [word, value] of Object.entries(TIMER_REGEX_NUMWORD)) {
    const re = new RegExp(`\\b${word}\\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h)\\b`);
    const m = text.match(re);
    if (m) {
      const u = m[1]!.toLowerCase();
      const unit: 's' | 'm' | 'h' = u.startsWith('s') || u === 's'
        ? 's'
        : u.startsWith('h') || u === 'h'
          ? 'h'
          : 'm';
      const seconds = unit === 's' ? value : unit === 'm' ? value * 60 : value * 3600;
      return {
        durationSeconds: Math.min(60 * 60 * 4, Math.max(1, Math.round(seconds))),
        confidence: 0.9,
      };
    }
  }
  // "an hour" / "a minute" / "a second" without exact numeric.
  if (/\ban?\s+hours?\b|\ban?\s+hour\b/.test(text)) {
    return { durationSeconds: 3600, confidence: 0.85 };
  }
  if (/\ban?\s+minutes?\b|\ban?\s+minute\b/.test(text)) {
    return { durationSeconds: 60, confidence: 0.85 };
  }
  if (/\ban?\s+seconds?\b|\ban?\s+second\b/.test(text)) {
    return { durationSeconds: 1, confidence: 0.85 };
  }
  return { durationSeconds: null, confidence: 0 };
};

const PARSE_TIMER_SYSTEM_PROMPT = `You are a kitchen timer parser. Given a single utterance from a cook, return ONLY a JSON object describing whether they want a timer started and for how long.

Rules (apply strictly):
1. If the utterance names a specific duration (number + unit, or word-number like "twelve minutes"), emission {action:"start", durationSeconds: <integer>}. Supported units: seconds, minutes, hours. 1 hour = 3600. Convert natural-language fractions: "quarter hour" = 15 minutes, "half hour" = 30 minutes, "an hour and a half" = 90 minutes.
2. If the utterance implies starting a timer without a duration ("I'm putting it in the oven now", "start cooking", "begin"), return {action:"start", durationSeconds: null}. The caller will fall back to the current step's timerSeconds.
3. If the utterance is not about starting a timer (a question about ingredients, a navigation command, etc.), return {action:"none", durationSeconds: null}.
4. Clamp durationSeconds to [1, 14400] (max 4 hours). Round to the nearest integer.
5. Self-rated confidence: 0.95 when number+unit is unambiguous, 0.7 for implicit, 0 for none.
6. Return ONLY the JSON. No commentary.`;

const parseTimerCache = new Map<string, { value: z.infer<typeof ParseTimerUtteranceResponseSchema>; insertedAt: number }>();
const PARSE_TIMER_CACHE_MAX = 100;
const PARSE_TIMER_CACHE_TTL_MS = 30 * 60 * 1000;
const readParseTimerCache = (key: string): z.infer<typeof ParseTimerUtteranceResponseSchema> | null => {
  const e = parseTimerCache.get(key);
  if (!e) return null;
  if (Date.now() - e.insertedAt > PARSE_TIMER_CACHE_TTL_MS) {
    parseTimerCache.delete(key);
    return null;
  }
  return e.value;
};
const writeParseTimerCache = (key: string, value: z.infer<typeof ParseTimerUtteranceResponseSchema>): void => {
  if (parseTimerCache.size >= PARSE_TIMER_CACHE_MAX) {
    const oldest = parseTimerCache.keys().next().value;
    if (oldest !== undefined) parseTimerCache.delete(oldest);
  }
  parseTimerCache.set(key, { value, insertedAt: Date.now() });
};

export const parseTimerUtterance = onCall(ALL_TOOL_GUARD, async (req) => {
  const uid = requireUid(req);
  const input = ParseTimerUtteranceRequestSchema.parse(req.data);

  // Same permissive session lookup the overlay's `ask_chef` uses.
  // The CookVoiceOverlay sends synthetic `cookmode:` ids; we accept
  // and log so analytics can see the overlay path being used.
  const session = await getSession(uid, input.sessionId);
  if (!session) {
    logEvent(input.sessionId, 'AGENT_TOOL_LOG', 'agent', {
      tool: 'parse_timer_utterance',
      source: 'overlay',
      note: 'session-not-found',
    });
  }

  // Cache key — same shape as ask_chef.
  const cacheKey = (input.cacheKey ?? normalizeQuestionForCache(input.utterance)) +
    '|' + (input.currentStepPhase ?? 'any') + '|timer';
  const cached = readParseTimerCache(cacheKey);
  if (cached) {
    logEvent(input.sessionId, 'AGENT_TOOL_LOG', 'agent', {
      tool: 'parse_timer_utterance',
      source: 'cache',
      cacheKey,
    });
    return { ...cached, source: cached.source };
  }

  // 1. Local regex on the server (defensive — the browser usually
  //    pre-resolves so this only fires for non-demo or arg-bypass).
  const regex = serverParseTimerRegex(input.utterance);
  if (regex.durationSeconds != null) {
    const result: z.infer<typeof ParseTimerUtteranceResponseSchema> = {
      action: 'start',
      durationSeconds: regex.durationSeconds,
      source: 'regex',
      confidence: regex.confidence,
    };
    writeParseTimerCache(cacheKey, result);
    logEvent(input.sessionId, 'AGENT_TOOL_LOG', 'agent', {
      tool: 'parse_timer_utterance',
      source: 'regex',
      cacheKey,
      durationSeconds: result.durationSeconds,
    });
    return result;
  }

  // 2. LLM fallback for ambiguous utterances like "I'm putting it in
  //    the oven now" or "start cooking".
  try {
    const out = await ai.generate({
      model: gemini20Flash,
      prompt: `${PARSE_TIMER_SYSTEM_PROMPT}\n\nUTTERANCE: ${input.utterance}`,
      output: { schema: ParseTimerUtteranceResponseSchema as unknown as z.ZodTypeAny },
      config: { temperature: 0.1, maxOutputTokens: 96 },
    });
    const parsed = ParseTimerUtteranceResponseSchema.safeParse(out.output);
    if (!parsed.success) {
      logEvent(input.sessionId, 'ERROR_OCCURRED', 'system', {
        tool: 'parse_timer_utterance',
        reason: 'parse_failed',
      });
      return {
        action: 'none' as const,
        durationSeconds: null,
        source: 'fallback' as const,
        confidence: 0,
      };
    }
    writeParseTimerCache(cacheKey, parsed.data);
    logEvent(input.sessionId, 'AGENT_TOOL_LOG', 'agent', {
      tool: 'parse_timer_utterance',
      source: 'llm',
      cacheKey,
      durationSeconds: parsed.data.durationSeconds,
    });
    return parsed.data;
  } catch (_err) {
    void _err;
    logEvent(input.sessionId, 'ERROR_OCCURRED', 'system', {
      tool: 'parse_timer_utterance',
      reason: 'llm_unavailable',
    });
    return {
      action: 'none' as const,
      durationSeconds: null,
      source: 'fallback' as const,
      confidence: 0,
    };
  }
});
