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
  GenerateRecipeResponseSchema,
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
