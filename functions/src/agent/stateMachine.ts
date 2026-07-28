/**
 * Pure state-machine for a cooking session.
 *
 * Includes the transition table (Phase × Trigger → Phase) plus the
 * pure helpers the onCall tools use to advance / rewind / pause /
 * complete the session. No I/O — caller reads/writes Firestore via
 * `sessionStore.ts`.
 *
 * Why a hand-rolled machine instead of XState:
 *   - The user spec lists ~15 named phases; a flat table is easy to
 *     audit at code-review time.
 *   - No React on the backend; bindings to firestore are the only
 *     side-effecting surface.
 *   - Edge cases (substitution, correction, error recovery) each get
 *     a single declarative transition — never tangle the flow with
 *     branching imperative code.
 *
 * Session-side state preserved across pause:
 *   Each session stores `previousPhaseBeforePause`. The pause tool
 *   records the phase we were in (PREP_GUIDANCE / COOKING_GUIDANCE /
 *   PLATING / etc.) and the resume tool restores it. This avoids
 *   the original schema ambiguity around "to which phase does pause
 *   resume?".
 */
import {
  CookingSessionPhaseSchema,
  type CookingSession,
  type CookingSessionPhase,
} from './schemas.js';

/** Triggers the session emits. Pure data — types fine. */
export type SessionTrigger =
  | 'USER_SPEAKS_INGREDIENTS'
  | 'USER_CONFIRMS_INGREDIENTS'
  | 'USER_PROVIDES_REQUIREMENTS'
  | 'RECIPE_GENERATED'
  | 'RECIPE_VALIDATED_OK'
  | 'RECIPE_VALIDATION_FAILED'
  | 'USER_STARTS_COOKING'
  | 'STEP_COMPLETED'
  | 'STEP_REPEATED'
  | 'USER_GOES_BACK'
  | 'USER_PAUSED'
  | 'USER_RESUMED'
  | 'SUBSTITUTION_REQUESTED'
  | 'SUBSTITUTION_RESOLVED'
  | 'TIMER_STARTED'
  | 'TIMER_FINISHED'
  | 'SESSION_COMPLETED'
  | 'SESSION_ABANDONED'
  | 'ERROR'
  | 'USER_CORRECTED';

/** Transition row. */
type Transition = {
  trigger: SessionTrigger;
  to: CookingSessionPhase;
  /** Whether the transition is one-way (back) — used by `legalTransitions`. */
  allowFromTerminal?: boolean;
};

/**
 * Legal transition table. Any phase × trigger combination NOT in this
 * table raises `IllegalTransitionError` from `transition()`.
 *
 * Resume handling: PAUSED → USER_RESUMED always transitions back to
 * the `previousPhaseBeforePause` recorded at pause-time. The table
 * row itself is symbolic only — `transition(PAUSED, USER_RESUMED)`
 * returns the generic COOKING_GUIDANCE fallback so the table lookup
 * is non-empty for invalid pre-pause phases; the actual phase is
 * restored caller-side. See `pausePreservePhase` and the
 * `resumeCookingSession` onCall.
 */
export const TRANSITIONS: Readonly<Record<CookingSessionPhase, ReadonlyArray<Transition>>> = {
  IDLE: [
    { trigger: 'USER_SPEAKS_INGREDIENTS', to: 'COLLECTING_INGREDIENTS' },
    { trigger: 'USER_CONFIRMS_INGREDIENTS', to: 'CONFIRMING_INGREDIENTS' },
    { trigger: 'RECIPE_GENERATED', to: 'RECIPE_READY' },
  ],
  COLLECTING_INGREDIENTS: [
    { trigger: 'USER_CONFIRMS_INGREDIENTS', to: 'CONFIRMING_INGREDIENTS' },
    { trigger: 'USER_PROVIDES_REQUIREMENTS', to: 'COLLECTING_REQUIREMENTS' },
    { trigger: 'RECIPE_GENERATED', to: 'RECIPE_READY' },
  ],
  CONFIRMING_INGREDIENTS: [
    { trigger: 'USER_CONFIRMS_INGREDIENTS', to: 'CONFIRMING_INGREDIENTS' },
    { trigger: 'USER_PROVIDES_REQUIREMENTS', to: 'COLLECTING_REQUIREMENTS' },
    { trigger: 'USER_SPEAKS_INGREDIENTS', to: 'COLLECTING_INGREDIENTS' },
    { trigger: 'USER_CORRECTED', to: 'COLLECTING_INGREDIENTS' },
    { trigger: 'RECIPE_GENERATED', to: 'RECIPE_READY' },
  ],
  COLLECTING_REQUIREMENTS: [
    { trigger: 'USER_CONFIRMS_INGREDIENTS', to: 'CONFIRMING_INGREDIENTS' },
    { trigger: 'USER_PROVIDES_REQUIREMENTS', to: 'COLLECTING_REQUIREMENTS' },
    { trigger: 'RECIPE_GENERATED', to: 'GENERATING_RECIPE' },
  ],
  GENERATING_RECIPE: [
    { trigger: 'RECIPE_VALIDATED_OK', to: 'VALIDATING_RECIPE' },
    { trigger: 'RECIPE_VALIDATION_FAILED', to: 'ERROR_RECOVERY' },
  ],
  VALIDATING_RECIPE: [
    { trigger: 'RECIPE_GENERATED', to: 'RECIPE_READY' },
    { trigger: 'RECIPE_VALIDATION_FAILED', to: 'ERROR_RECOVERY' },
  ],
  RECIPE_READY: [
    { trigger: 'USER_STARTS_COOKING', to: 'PREP_GUIDANCE' },
    { trigger: 'USER_PROVIDES_REQUIREMENTS', to: 'COLLECTING_REQUIREMENTS' },
    { trigger: 'SESSION_ABANDONED', to: 'IDLE', allowFromTerminal: true },
  ],
  PREP_GUIDANCE: [
    { trigger: 'STEP_COMPLETED', to: 'PREP_GUIDANCE' },
    { trigger: 'STEP_REPEATED', to: 'PREP_GUIDANCE' },
    { trigger: 'USER_GOES_BACK', to: 'PREP_GUIDANCE' },
    { trigger: 'USER_PAUSED', to: 'PAUSED' },
    { trigger: 'TIMER_STARTED', to: 'WAITING_FOR_TIMER' },
    { trigger: 'SESSION_COMPLETED', to: 'COMPLETED' },
    { trigger: 'SUBSTITUTION_REQUESTED', to: 'SUBSTITUTION_REQUIRED' },
  ],
  COOKING_GUIDANCE: [
    { trigger: 'STEP_COMPLETED', to: 'COOKING_GUIDANCE' },
    { trigger: 'STEP_REPEATED', to: 'COOKING_GUIDANCE' },
    { trigger: 'USER_GOES_BACK', to: 'COOKING_GUIDANCE' },
    { trigger: 'USER_PAUSED', to: 'PAUSED' },
    { trigger: 'TIMER_STARTED', to: 'WAITING_FOR_TIMER' },
    { trigger: 'SESSION_COMPLETED', to: 'COMPLETED' },
    { trigger: 'SUBSTITUTION_REQUESTED', to: 'SUBSTITUTION_REQUIRED' },
  ],
  PLATING: [
    { trigger: 'STEP_COMPLETED', to: 'PLATING' },
    { trigger: 'STEP_REPEATED', to: 'PLATING' },
    { trigger: 'USER_GOES_BACK', to: 'COOKING_GUIDANCE' },
    { trigger: 'USER_PAUSED', to: 'PAUSED' },
    { trigger: 'SESSION_COMPLETED', to: 'COMPLETED' },
  ],
  WAITING_FOR_TIMER: [
    { trigger: 'TIMER_FINISHED', to: 'COOKING_GUIDANCE' },
    { trigger: 'STEP_COMPLETED', to: 'COOKING_GUIDANCE' },
    { trigger: 'USER_PAUSED', to: 'PAUSED' },
    { trigger: 'SUBSTITUTION_REQUESTED', to: 'SUBSTITUTION_REQUIRED' },
  ],
  PAUSED: [
    // Fallback destination if no `previousPhaseBeforePause` recorded.
    // The runtime resume tool prefers the persisted phase over this
    // generic fallback so the cook returns to the phase they paused
    // from.
    { trigger: 'USER_RESUMED', to: 'COOKING_GUIDANCE' },
    { trigger: 'SESSION_ABANDONED', to: 'IDLE', allowFromTerminal: true },
  ],
  SUBSTITUTION_REQUIRED: [
    { trigger: 'SUBSTITUTION_RESOLVED', to: 'COOKING_GUIDANCE' },
    { trigger: 'USER_PAUSED', to: 'PAUSED' },
  ],
  USER_CORRECTION: [
    { trigger: 'USER_CORRECTED', to: 'PREP_GUIDANCE' },
    { trigger: 'STEP_COMPLETED', to: 'COOKING_GUIDANCE' },
    { trigger: 'USER_PAUSED', to: 'PAUSED' },
  ],
  COMPLETED: [{ trigger: 'USER_SPEAKS_INGREDIENTS', to: 'IDLE' }],
  ERROR_RECOVERY: [
    { trigger: 'USER_RESUMED', to: 'RECIPE_READY' },
    { trigger: 'RECIPE_GENERATED', to: 'RECIPE_READY' },
    { trigger: 'SESSION_ABANDONED', to: 'IDLE', allowFromTerminal: true },
  ],
};

/**
 * Apply a trigger to a session. Pure: returns the next phase or throws.
 * Throws `IllegalTransitionError` on no-match — surfacing the illegal
 * transition at the tool layer (we don't silently mask this).
 */
export class IllegalTransitionError extends Error {
  constructor(
    readonly fromPhase: CookingSessionPhase,
    readonly trigger: SessionTrigger,
  ) {
    super(`Illegal transition from ${fromPhase} on ${trigger}`);
    this.name = 'IllegalTransitionError';
  }
}

export const transition = (
  current: CookingSessionPhase,
  trigger: SessionTrigger,
): CookingSessionPhase => {
  const rows = TRANSITIONS[current];
  const sorted = [...rows].sort((a, b) => {
    const af = a.allowFromTerminal ? 1 : 0;
    const bf = b.allowFromTerminal ? 1 : 0;
    return af - bf;
  });
  for (const row of sorted) {
    if (row.trigger === trigger) return row.to;
  }
  throw new IllegalTransitionError(current, trigger);
};

/** Defensive helper: list every legal follow-up phase + trigger. */
export const legalTransitions = (
  from: CookingSessionPhase,
): ReadonlyArray<{ trigger: SessionTrigger; to: CookingSessionPhase }> =>
  TRANSITIONS[from];

/** Cheap regression catch for Zod enum extension changes. */
export const isKnownPhase = (p: string): p is CookingSessionPhase =>
  CookingSessionPhaseSchema.safeParse(p).success;

/**
 * When the user pauses, capture the phase they're leaving so resume
 * returns to that exact phase. PAUSED itself is volatile — it only
 * survives one cycle. We deliberately exclude `PAUSED` itself and the
 * terminal `COMPLETED` / `IDLE` so a pause from those phases doesn't
 * get restored into itself.
 */
export const pausePreservePhase = (current: CookingSessionPhase): CookingSessionPhase | null => {
  if (current === 'PAUSED') return null;
  if (current === 'COMPLETED') return null;
  if (current === 'IDLE') return null;
  return current;
};

/**
 * Step inside prep/cooking doesn't change the phase — stepping into
 * the final step flips to COMPLETED in the caller, but the helper
 * itself stays put.
 */
export const nextStepPhase = (session: CookingSession): CookingSessionPhase => session.phase;

/**
 * Stepping backward from the very first prep step drops the cook back
 * to RECIPE_READY so they can confirm before restarting cooking.
 */
export const prevStepPhase = (
  session: CookingSession,
  prevIndex: number,
): CookingSessionPhase => {
  if (session.phase === 'PREP_GUIDANCE' && prevIndex === 0) {
    return 'RECIPE_READY';
  }
  return session.phase;
};

/**
 * Backwards compat with the unused helper exported in v0.1. Held
 * here so older tests that import `derivePhase` keep their shape.
 */
export const derivePhase = (session: CookingSession): CookingSessionPhase => session.phase;
