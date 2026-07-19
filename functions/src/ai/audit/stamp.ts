/**
 * Server-side augmentation of `MealPlanSchema.generationMetadata`.
 *
 * Why this module exists
 * ----------------------
 * The schema requires six fields on the public plan that the AI cannot
 * honestly know on its own:
 *
 *   • `durationMs` — gap between the user's call and our return.
 *   • `retryCount` — was the repair-once path taken?
 *   • `validation` — `'passed' | 'repaired' | 'failed'`.
 *   • `generatedAt` — when parse/augmentation completed.
 *   • `modelName` — which model served this request.
 *   • `promptVersion` — which prompt template we're running.
 *
 * Before this helper, the model wrote all six — and hallucinated four
 * of them. The V2 prompt (PR #6) tells the model the right values for
 * `modelName` + `promptVersion`, but the model still can't know
 * `durationMs`, `retryCount`, `validation`, or `generatedAt` with any
 * honesty. Server-stamping all six gives us a trustworthy audit trail
 * regardless of model behaviour.
 *
 * Why pure (no SDK imports)
 * -------------------------
 * Keeping this helper pure means it's testable offline without booting
 * Genkit, `@genkit-ai/vertexai`, or `firebase-functions/v2/https`. The
 * tests in `tests-rules/serverStamp.test.ts` exercise the helper
 * directly with synthetic plans + ctx objects.
 */
import type { MealPlan } from '../schemas/index.js';
import { PROMPT_VERSION } from '../prompts/system.js';

/**
 * The model name server-stamped on every plan. We hard-code it rather
 * than read it from the `@genkit-ai/vertexai` export so the audit
 * field is independent of any dependency upgrade that might rename
 * `gemini20Flash`. If we ever fall back to a different vertex model,
 * bump this constant in the same PR as the model swap.
 */
export const STAMPED_MODEL_NAME = 'gemini-2.0-flash';

/**
 * The four metrics server-stamps on each call. The three identity
 * fields (`STAMPED_MODEL_NAME`, `PROMPT_VERSION`, plus
 * `serverStampedAt`) are derived inside the helper; the caller passes
 * only what the helper can NOT determine on its own.
 */
export interface ServerStampContext {
  /** Wall-clock gap between `onCall`-entry and return, in milliseconds. */
  readonly durationMs: number;
  /** 0 if the first pass validated; 1 if the repair-once pass validated. */
  readonly retryCount: 0 | 1;
  /**
   * `'passed'` if the first pass validated; `'repaired'` if the repair pass did.
   *
   * `'failed'` is intentionally NOT part of this union. Failures
   * (both pass-fail and repair-fail) are emitted as a
   * `console.warn(...)` in `generateMealPlanFlow` for Cloud Logging,
   * then surface to the client as a generic HttpsError. Splitting
   * `'failed'` out of the augmentation helper avoids two failure modes:
   *   1. We don't want to leak `'failed'` values back to the client
   *      (callers could infer internal prompt drift from the rate).
   *   2. The helper is `MealPlan → MealPlan`. On a `'failed'` path
   *      we never have a valid MealPlan to return, so there's
   *      nothing to stamp.
   * If you find yourself wanting to stamp `'failed'` here, you are
   * almost certainly trying to ship error context to the client.
   * Don't — use the warn-then-throw pattern instead.
   */
  readonly validation: 'passed' | 'repaired';
}

/**
 * Returns a new MealPlan whose `generationMetadata` block is fully
 * server-stamped. Non-augmented fields (`summary`, `recipes`,
 * `input`, `planLength`) are spread through unchanged.
 *
 * Pure function. Safe to call inside `try` blocks without affecting
 * the original plan object.
 */
export function stampGenerationMetadata(
  plan: MealPlan,
  ctx: ServerStampContext,
): MealPlan {
  return {
    ...plan,
    generationMetadata: {
      modelName: STAMPED_MODEL_NAME,
      promptVersion: PROMPT_VERSION,
      generatedAt: new Date().toISOString(),
      durationMs: ctx.durationMs,
      retryCount: ctx.retryCount,
      validation: ctx.validation,
    },
  };
}
