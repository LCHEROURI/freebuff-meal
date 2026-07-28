/**
 * Browser-side typed wrappers for the 15 cooking-agent onCalls.
 *
 * Two modes:
 *
 *   1. **Firebase mode** — `httpsCallable` calls each onCall handler
 *      exactly as the existing flows do. Server-side validation +
 *      rate limits + Firestore persistence.
 *
 *   2. **Demo mode** — when `isFirebaseConfigured() === false`, we
 *      substitute `localDemoAgent` which keeps the entire session
 *      + recipe in localStorage. This lets the wizard stay
 *      walkable end-to-end during local dev / preview without
 *      burning a real Firebase quota.
 *
 * The wizard (`CookingAgentPage`) calls these across both modes
 * without branching — same surface, same return shape.
 */
import { httpsCallable, type Functions } from 'firebase/functions';

import { initFirebase, getFunctionsInstance } from '@/lib/firebase/app';
import { isFirebaseConfigured } from '@/lib/env';

import type {
  AgentIngredient,
  CookingSession,
  CookingSessionPhase,
} from './agentTypes';

export type AgentRecipe = {
  id: string;
  name: string;
  shortDescription: string;
  cuisine: string;
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  ingredients: AgentIngredient[];
  prepSteps: Array<{
    stepNumber: number;
    instruction: string;
    spokenInstruction: string;
    estimatedSeconds: number;
  }>;
  cookingSteps: Array<{
    stepNumber: number;
    instruction: string;
    spokenInstruction: string;
    timerSeconds: number | null;
    temperature: string | null;
    ingredientsUsed: string[];
    safetyCritical: boolean;
  }>;
  safety: { minimumInternalTemperatureF: number | null };
};

export type StepView = {
  stepNumber: number;
  phase: 'preparation' | 'cooking' | 'presentation';
  text: string;
  spokenText: string;
  timerSeconds: number | null;
  ingredientsUsed: string[];
  safetyCritical: boolean;
};

// =====================================================================
//  Mode routing
// =====================================================================

const getCallable = (functions: Functions | undefined, name: string) => {
  if (!functions) throw new Error('Firebase Functions not initialized.');
  return httpsCallable(functions, name);
};

// Each tool name maps to a callable + a sensible arg shape.
const callTool = async <TIn, TOut>(
  name: string,
  args: TIn,
): Promise<TOut> => {
  initFirebase();
  if (!isFirebaseConfigured()) {
    // Fall through to localDemoAgent. The cast goes through `unknown`
    // because each localDemoAgent method has a specific signature —
    // not interchangeable through `Record<string, (a: TIn) => ...>`
    // without erasing first.
    const fn = (localDemoAgent as unknown as Record<string, (a: unknown) => Promise<unknown>>)[name];
    if (!fn) throw new Error(`Local demo agent has no handler for ${name}.`);
    return (await fn(args)) as TOut;
  }
  const fns = getFunctionsInstance();
  const cb = getCallable(fns, name);
  const res = await cb(args);
  return res.data as TOut;
};

// =====================================================================
//  Public surface — one method per tool.
// =====================================================================

export const agentClient = {
  isDemoMode: (): boolean => !isFirebaseConfigured(),

  saveAvailableIngredients: (ingredients: AgentIngredient[]) =>
    callTool<{ ingredients: AgentIngredient[] }, {
      ingredients: AgentIngredient[];
      warnings: string[];
      savedAt: string;
      sessionId: string;
    }>(
      'saveAvailableIngredients',
      { ingredients },
    ),

  updateAvailableIngredients: (args: {
    sessionId: string;
    add?: AgentIngredient[];
    removeIndexes?: number[];
    replaceIndexes?: Array<{ index: number; ingredient: AgentIngredient }>;
  }) =>
    callTool<typeof args, {
      ingredients: AgentIngredient[];
      warnings: string[];
      savedAt: string;
    }>('updateAvailableIngredients', args),

  generateRecipe: (args: {
    sessionId: string;
    ingredients: AgentIngredient[];
    servings: number;
    mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
    maximumMinutes: number;
    equipment?: string[];
    dietaryRestrictions?: string[];
    allergens?: string[];
  }) =>
    callTool<typeof args, { recipe: AgentRecipe; unknownIngredients: string[] }>(
      'generateRecipe',
      args,
    ),

  validateRecipe: (args: {
    sessionId: string;
    recipe: AgentRecipe;
    equipment?: string[];
  }) =>
    callTool<
      typeof args,
      { ok: boolean; issues: Array<{ severity: 'error' | 'warning' | 'info'; message: string }> }
    >('validateRecipe', args),

  startCookingSession: (args: { sessionId: string }) =>
    callTool<typeof args, { session: CookingSession; recipe: AgentRecipe }>(
      'startCookingSession',
      args,
    ),

  getCurrentStep: (args: { sessionId: string }) =>
    callTool<typeof args, { session: CookingSession; step: StepView; totalSteps: number }>(
      'getCurrentStep',
      args,
    ),

  completeCurrentStep: (args: { sessionId: string }) =>
    callTool<typeof args, {
      session: CookingSession;
      step: StepView | null;
      totalSteps: number;
    }>('completeCurrentStep', args),

  repeatCurrentStep: (args: { sessionId: string }) =>
    callTool<typeof args, { session: CookingSession; step: StepView; totalSteps: number }>(
      'repeatCurrentStep',
      args,
    ),

  previousStep: (args: { sessionId: string }) =>
    callTool<typeof args, {
      session: CookingSession;
      step: StepView | null;
      totalSteps: number;
    }>('previousStep', args),

  replaceIngredient: (args: {
    sessionId: string;
    originalIngredient: string;
    replacement: string;
    addedAllergens?: string[];
  }) =>
    callTool<typeof args, {
      session: CookingSession;
      warning: string | null;
      prompt: string | null;
    }>('replaceIngredient', args),

  resizeRecipe: (args: { sessionId: string; newServings: number }) =>
    callTool<typeof args, { session: CookingSession; recipe: AgentRecipe }>(
      'resizeRecipe',
      args,
    ),

  startTimer: (args: { sessionId: string; durationSeconds: number }) =>
    callTool<typeof args, {
      session: CookingSession;
      timerId: string;
      startedAt: string;
    }>('startTimer', args),

  pauseCookingSession: (args: { sessionId: string }) =>
    callTool<typeof args, { session: CookingSession }>(
      'pauseCookingSession',
      args,
    ),

  resumeCookingSession: (args: { sessionId: string }) =>
    callTool<typeof args, { session: CookingSession }>(
      'resumeCookingSession',
      args,
    ),

  endCookingSession: (args: {
    sessionId: string;
    status?: 'completed' | 'abandoned';
  }) =>
    callTool<typeof args, { session: CookingSession }>(
      'endCookingSession',
      args,
    ),

  extractIngredientsFromSpeech: (utterance: string) =>
    callTool<{ utterance: string }, { ingredients: AgentIngredient[]; warnings: string[] }>(
      'extractIngredientsFromSpeech',
      { utterance },
    ),
};

// =====================================================================
//  Local demo agent — used in demo mode (no Firebase).
//
//  Pure localStorage-backed stand-in so the wizard stays walkable.
//  The ingredient extractor is a deterministic (no-LLM) heuristic;
//  recipes come from a small hand-curated set keyed off the
//  first ingredient name. Clearly labeled "demo" so the user sees it.
// =====================================================================

const DEMO_RECIPE: AgentRecipe = {
  id: 'demo-recipe',
  name: 'One-Pan Tomato Basil Chicken',
  shortDescription: 'A 30-minute weeknight classic — pan-seared chicken in a quick tomato-basil sauce.',
  cuisine: 'Italian',
  servings: 2,
  prepMinutes: 8,
  cookMinutes: 22,
  ingredients: [
    { name: 'chicken breast', quantity: 2, unit: null, condition: 'fresh', confidence: 0.9 },
    { name: 'tomato', quantity: 3, unit: null, condition: 'fresh', confidence: 0.7 },
    { name: 'garlic', quantity: 3, unit: 'cloves', condition: 'fresh', confidence: 0.8 },
    { name: 'olive oil', quantity: 2, unit: 'tbsp', condition: null, confidence: 0.9 },
    { name: 'basil', quantity: null, unit: null, condition: 'fresh', confidence: 0.6 },
    { name: 'salt', quantity: null, unit: null, condition: null, confidence: 0.6 },
    { name: 'pepper', quantity: null, unit: null, condition: null, confidence: 0.6 },
  ],
  prepSteps: [
    {
      stepNumber: 1,
      instruction: 'Pat the chicken dry and season both sides with salt and pepper.',
      spokenInstruction: 'Pat the chicken dry and season it with salt and pepper.',
      estimatedSeconds: 60,
    },
    {
      stepNumber: 2,
      instruction: 'Mince 3 cloves of garlic.',
      spokenInstruction: 'Mince three cloves of garlic.',
      estimatedSeconds: 90,
    },
    {
      stepNumber: 3,
      instruction: 'Slice the tomatoes into thick rounds.',
      spokenInstruction: 'Slice the tomatoes.',
      estimatedSeconds: 75,
    },
  ],
  cookingSteps: [
    {
      stepNumber: 4,
      instruction: 'Heat 2 tbsp olive oil in a pan over medium-high heat until shimmering.',
      spokenInstruction: 'Heat two tablespoons of olive oil over medium-high heat.',
      timerSeconds: 120,
      temperature: 'medium-high',
      ingredientsUsed: ['olive oil'],
      safetyCritical: false,
    },
    {
      stepNumber: 5,
      instruction: 'Cook the chicken for 4 minutes per side until golden.',
      spokenInstruction: 'Cook the chicken for four minutes per side.',
      timerSeconds: 480,
      temperature: 'medium-high',
      ingredientsUsed: ['chicken breast'],
      safetyCritical: true,
    },
    {
      stepNumber: 6,
      instruction: 'Lower heat to medium, add garlic until fragrant (30 seconds).',
      spokenInstruction: 'Lower heat to medium and add the garlic for thirty seconds.',
      timerSeconds: 30,
      temperature: 'medium',
      ingredientsUsed: ['garlic'],
      safetyCritical: false,
    },
    {
      stepNumber: 7,
      instruction: 'Add the tomatoes and a pinch of salt; simmer 6 minutes.',
      spokenInstruction: 'Add the tomatoes and simmer for six minutes.',
      timerSeconds: 360,
      temperature: 'medium',
      ingredientsUsed: ['tomato'],
      safetyCritical: false,
    },
    {
      stepNumber: 8,
      instruction: 'Top with torn basil and serve.',
      spokenInstruction: 'Top with torn basil and serve.',
      timerSeconds: null,
      temperature: null,
      ingredientsUsed: ['basil'],
      safetyCritical: false,
    },
  ],
  safety: { minimumInternalTemperatureF: 165 },
};

const nowIso = () => new Date().toISOString();
const newId = (uid: string) => `demo_cook_${uid}_${Math.random().toString(36).slice(2, 8)}`;

const localDemoAgent = {
  saveAvailableIngredients: (args: { ingredients: AgentIngredient[] }) => {
    const uid = 'demo-user';
    const id = newId(uid);
    const session: CookingSession = {
      id,
      ownerId: uid,
      status: 'active',
      phase: 'COLLECTING_INGREDIENTS' as CookingSessionPhase,
      currentStepIndex: 0,
      recipeId: null,
      ingredients: args.ingredients,
      servings: 2,
      maximumMinutes: 45,
      equipment: [],
      startedAt: nowIso(),
      lastActivityAt: nowIso(),
      completedAt: null,
      previousPhaseBeforePause: null,
    };
    try {
      window.localStorage.setItem(`freebuff:agent:session:${id}`, JSON.stringify(session));
    } catch {/* */}
    return {
      ingredients: args.ingredients,
      warnings: [] as string[],
      savedAt: nowIso(),
      sessionId: session.id,
    };
  },

  generateRecipe: (_args: {
    sessionId: string;
    ingredients: AgentIngredient[];
    servings: number;
    mealType?: string;
    maximumMinutes: number;
    equipment?: string[];
    dietaryRestrictions?: string[];
    allergens?: string[];
  }) => {
    return { recipe: DEMO_RECIPE, unknownIngredients: [] };
  },

  startCookingSession: (args: { sessionId: string }) => {
    const session: CookingSession = {
      id: args.sessionId,
      ownerId: 'demo-user',
      status: 'active',
      phase: 'PREP_GUIDANCE' as CookingSessionPhase,
      currentStepIndex: 0,
      recipeId: DEMO_RECIPE.id,
      ingredients: [],
      servings: 2,
      maximumMinutes: 45,
      equipment: [],
      startedAt: nowIso(),
      lastActivityAt: nowIso(),
      completedAt: null,
      previousPhaseBeforePause: null,
    };
    try {
      window.localStorage.setItem(
        `freebuff:agent:session:${args.sessionId}`,
        JSON.stringify(session),
      );
      window.localStorage.setItem(
        `freebuff:agent:recipe:${args.sessionId}`,
        JSON.stringify(DEMO_RECIPE),
      );
    } catch {/* */}
    return { session, recipe: DEMO_RECIPE };
  },

  getCurrentStep: (args: { sessionId: string }) => {
    const recipe = loadDemoRecipe(args.sessionId);
    const session = loadDemoSession(args.sessionId);
    return {
      session,
      step: flattenStep(recipe, session.currentStepIndex),
      totalSteps: recipe.prepSteps.length + recipe.cookingSteps.length,
    };
  },

  completeCurrentStep: (args: { sessionId: string }) => {
    const recipe = loadDemoRecipe(args.sessionId);
    const cur = loadDemoSession(args.sessionId);
    const total = recipe.prepSteps.length + recipe.cookingSteps.length;
    const nextIdx = Math.min(total - 1, cur.currentStepIndex + 1);
    const reachedEnd = nextIdx === total - 1;
    const next: CookingSession = {
      ...cur,
      currentStepIndex: nextIdx,
      status: reachedEnd ? 'completed' : 'active',
      phase: reachedEnd ? 'COMPLETED' : 'PREP_GUIDANCE',
      completedAt: reachedEnd ? nowIso() : null,
      lastActivityAt: nowIso(),
    };
    saveDemoSession(next);
    return {
      session: next,
      step: reachedEnd ? null : flattenStep(recipe, next.currentStepIndex),
      totalSteps: total,
    };
  },

  repeatCurrentStep: (args: { sessionId: string }) => {
    const recipe = loadDemoRecipe(args.sessionId);
    const session = loadDemoSession(args.sessionId);
    return {
      session,
      step: flattenStep(recipe, session.currentStepIndex),
      totalSteps: recipe.prepSteps.length + recipe.cookingSteps.length,
    };
  },

  previousStep: (args: { sessionId: string }) => {
    const recipe = loadDemoRecipe(args.sessionId);
    const cur = loadDemoSession(args.sessionId);
    const prevIdx = Math.max(0, cur.currentStepIndex - 1);
    const next: CookingSession = {
      ...cur,
      currentStepIndex: prevIdx,
      phase: prevIdx === 0 ? 'RECIPE_READY' : 'PREP_GUIDANCE',
      lastActivityAt: nowIso(),
    };
    saveDemoSession(next);
    return {
      session: next,
      step: flattenStep(recipe, prevIdx),
      totalSteps: recipe.prepSteps.length + recipe.cookingSteps.length,
    };
  },

  pauseCookingSession: (args: { sessionId: string }) => {
    const cur = loadDemoSession(args.sessionId);
    const next: CookingSession = {
      ...cur,
      status: 'paused',
      phase: 'PAUSED',
      previousPhaseBeforePause: cur.phase,
      lastActivityAt: nowIso(),
    };
    saveDemoSession(next);
    return { session: next };
  },

  resumeCookingSession: (args: { sessionId: string }) => {
    const cur = loadDemoSession(args.sessionId);
    // Mirror the real Firebase handler: only meaningful while paused,
    // otherwise no-op. Avoids a stale localStorage fallback from
    // silently desyncing into COOKING_GUIDANCE.
    if (cur.phase !== 'PAUSED') {
      return { session: cur };
    }
    const next: CookingSession = {
      ...cur,
      status: 'active',
      phase: cur.previousPhaseBeforePause ?? 'COOKING_GUIDANCE',
      previousPhaseBeforePause: null,
      lastActivityAt: nowIso(),
    };
    saveDemoSession(next);
    return { session: next };
  },

  endCookingSession: (args: { sessionId: string; status?: 'completed' | 'abandoned' }) => {
    const cur = loadDemoSession(args.sessionId);
    const next: CookingSession = {
      ...cur,
      status: args.status ?? 'completed',
      phase: args.status === 'abandoned' ? 'IDLE' : 'COMPLETED',
      completedAt: nowIso(),
      lastActivityAt: nowIso(),
    };
    saveDemoSession(next);
    return { session: next };
  },

  replaceIngredient: (args: {
    sessionId: string;
    originalIngredient: string;
    replacement: string;
    addedAllergens?: string[];
  }) => {
    const cur = loadDemoSession(args.sessionId);
    const warning =
      args.addedAllergens && args.addedAllergens.length > 0
        ? `Note: ${args.replacement} introduces ${args.addedAllergens.join(', ')}.`
        : null;
    const session: CookingSession = {
      ...cur,
      phase: 'SUBSTITUTION_REQUIRED',
      lastActivityAt: nowIso(),
    };
    saveDemoSession(session);
    return {
      session,
      warning,
      prompt: `Confirm: replace ${args.originalIngredient} with ${args.replacement}${
        warning ? ' (' + warning + ')' : ''
      } and continue cooking?`,
    };
  },

  resizeRecipe: (args: { sessionId: string; newServings: number }) => {
    const cur = loadDemoSession(args.sessionId);
    const recipe = loadDemoRecipe(args.sessionId);
    const next: CookingSession = { ...cur, servings: args.newServings, lastActivityAt: nowIso() };
    saveDemoSession(next);
    return { session: next, recipe };
  },

  startTimer: (args: { sessionId: string; durationSeconds: number }) => {
    const cur = loadDemoSession(args.sessionId);
    const next: CookingSession = { ...cur, phase: 'WAITING_FOR_TIMER', lastActivityAt: nowIso() };
    saveDemoSession(next);
    return {
      session: next,
      timerId: `timer_${Math.random().toString(36).slice(2, 10)}`,
      startedAt: nowIso(),
    };
  },

  validateRecipe: (_args: { sessionId: string; recipe: AgentRecipe }) => {
    return { ok: true, issues: [] };
  },

  updateAvailableIngredients: (args: {
    sessionId: string;
    add?: AgentIngredient[];
    removeIndexes?: number[];
    replaceIndexes?: Array<{ index: number; ingredient: AgentIngredient }>;
  }) => {
    const cur = loadDemoSession(args.sessionId);
    let next: AgentIngredient[] = [...cur.ingredients];
    const indices = [...(args.removeIndexes ?? [])].sort((a, b) => b - a);
    for (const idx of indices) if (idx < next.length) next.splice(idx, 1);
    const replaced = [...(args.replaceIndexes ?? [])].sort((a, b) => b.index - a.index);
    for (const rep of replaced) if (rep.index < next.length) next[rep.index] = rep.ingredient;
    if (args.add) next.push(...args.add);
    const session: CookingSession = { ...cur, ingredients: next, lastActivityAt: nowIso() };
    saveDemoSession(session);
    return { ingredients: next, warnings: [], savedAt: nowIso() };
  },

  extractIngredientsFromSpeech: (_args: { utterance: string }) => {
    return {
      ingredients: heuristicExtract(_args.utterance),
      warnings: ['Demo mode uses a heuristic — real extraction uses Gemini.'],
    };
  },
};

const flattenStep = (recipe: AgentRecipe, idx: number): StepView => {
  const flat = [];
  let n = 1;
  for (const s of recipe.prepSteps) {
    flat.push({
      stepNumber: n++,
      phase: 'preparation' as const,
      text: s.instruction,
      spokenText: s.spokenInstruction,
      timerSeconds: null,
      ingredientsUsed: [] as string[],
      safetyCritical: false,
    });
  }
  for (const s of recipe.cookingSteps) {
    flat.push({
      stepNumber: n++,
      phase: 'cooking' as const,
      text: s.instruction,
      spokenText: s.spokenInstruction,
      timerSeconds: s.timerSeconds ?? null,
      ingredientsUsed: s.ingredientsUsed,
      safetyCritical: s.safetyCritical,
    });
  }
  const clamped = Math.max(0, Math.min(flat.length - 1, idx));
  return flat[clamped];
};

const loadDemoSession = (sessionId: string): CookingSession => {
  try {
    const raw = window.localStorage.getItem(`freebuff:agent:session:${sessionId}`);
    if (!raw) throw new Error('not found');
    const parsed = JSON.parse(raw) as CookingSession;
    return parsed;
  } catch {
    return {
      id: sessionId,
      ownerId: 'demo-user',
      status: 'active',
      phase: 'PREP_GUIDANCE',
      currentStepIndex: 0,
      recipeId: DEMO_RECIPE.id,
      ingredients: DEMO_RECIPE.ingredients,
      servings: 2,
      maximumMinutes: 45,
      equipment: [],
      startedAt: nowIso(),
      lastActivityAt: nowIso(),
      completedAt: null,
      previousPhaseBeforePause: null,
    };
  }
};

const saveDemoSession = (session: CookingSession) => {
  try {
    window.localStorage.setItem(`freebuff:agent:session:${session.id}`, JSON.stringify(session));
  } catch {/* */}
};

const loadDemoRecipe = (sessionId: string): AgentRecipe => {
  try {
    const raw = window.localStorage.getItem(`freebuff:agent:recipe:${sessionId}`);
    if (!raw) throw new Error('not found');
    return JSON.parse(raw) as AgentRecipe;
  } catch {
    return DEMO_RECIPE;
  }
};

const heuristicExtract = (utterance: string): AgentIngredient[] => {
  const tokens = utterance
    .split(/[,;]+|\b(?:and|plus|also)\b/i)
    .map((t) => t.replace(/^\s*(?:i (?:have|also have)|some|a couple of|a few|the|of)\s+/i, '').trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: AgentIngredient[] = [];
  for (const token of tokens) {
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: token,
      quantity: null,
      unit: null,
      condition: /frozen/i.test(token)
        ? 'frozen'
        : /leftover/i.test(token)
          ? 'leftover'
          : null,
      confidence: 0.5,
    });
  }
  return out;
};
