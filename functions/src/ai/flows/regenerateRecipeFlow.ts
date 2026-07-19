/**
 * regenerateRecipeFlow — re-creates a single recipe within an existing plan
 * while honouring the user's reason (faster, cheaper, etc.) and the locked-
 * recipe list.
 *
 * Uses raw `onCall` for stable auth + App Check + rate-limit enforcement.
 * Recipe id stability: when we replace a recipe in the plan, we keep the
 * same `id` so subsequent lock comparisons remain valid.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { gemini20Flash } from '@genkit-ai/vertexai';
import { z } from 'zod';

import { ai } from '../../index.js';
import { PROMPT_VERSION, SYSTEM_PROMPT_V2 } from '../prompts/system.js';
import {
  RecipeSchema,
  RegenerationRequestSchema,
} from '../schemas/index.js';
import { checkRateLimit } from '../../rate-limits/usage.js';

const apiKey = defineSecret('GOOGLE_API_KEY');

// Server-side shape: the AI returns just the new recipe.
// We persist the original `id` so locked-recipe tracking stays intact.
const RegenerationOutputSchema = z.object({ recipe: RecipeSchema });

// Re-export publicly for client schemas.
export { RegenerationRequestSchema, RecipeSchema };

const REASON_HINTS: Record<string, string> = {
  faster: 'Make the replacement meaningfully faster while staying recognizable.',
  cheaper:
    'Make the replacement cheaper while staying recognizable and proportionally filling the week.',
  different_cuisine: 'Switch to a different recognizable cuisine.',
  different_protein: 'Swap the primary protein.',
  fewer_ingredients: 'Use fewer ingredients.',
  more_familiar: 'Pick a more familiar household dish.',
  use_more_pantry: 'Use more pantry items the user has on hand.',
  avoid_ingredient: 'Avoid the requested ingredient.',
};

export const regenerateRecipeFlow = onCall(
  { enforceAppCheck: true, secrets: [apiKey] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in to regenerate a recipe.');
    }

    try {
      const input = RegenerationRequestSchema.parse(request.data);
      await checkRateLimit(uid, 'recipe');

      const reasonText = REASON_HINTS[input.reason] ?? 'Regenerate thoughtfully.';
      const avoidExtra = input.reason === 'avoid_ingredient' && input.detail
        ? ` Avoid this ingredient: ${input.detail}.`
        : '';
      // Regenerated dishes must also carry per-step timers + honest
      // substitution ratios — the V2 affordances apply uniformly across
      // initial generation AND single-recipe regeneration.
      const prompt = `${SYSTEM_PROMPT_V2}\n\nA user is regenerating one recipe in their plan. ${reasonText}${avoidExtra}\n\nConstraints:\n- Do not duplicate any of these recipes: ${input.lockedRecipeIds.join(', ') || '(none)'}\n- Keep the new recipe's \`id\` slot stable (do not invent a new id unless one is not supplied).\n- Plan id: ${input.planId}\n- Original recipe id (preserve unless the AI genuinely needs a new id): ${input.recipeId}\n- Stamp the recorded \`promptVersion\` as "${PROMPT_VERSION}".`;

      const out = await ai.generate({
        model: gemini20Flash,
        prompt,
        output: { schema: RegenerationOutputSchema as unknown as z.ZodTypeAny },
        config: { temperature: 0.6, maxOutputTokens: 1024 },
      });

      const parsed = RegenerationOutputSchema.safeParse(out.output);
      if (!parsed.success) {
        throw new HttpsError('internal', 'AI returned an invalid recipe.');
      }
      return { recipe: parsed.data.recipe };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith('RATE_LIMIT_COOLDOWN_')) {
        throw new HttpsError(
          'resource-exhausted',
          'Please wait a few seconds before regenerating.',
        );
      }
      if (message.startsWith('RATE_LIMIT_DAILY_')) {
        throw new HttpsError(
          'resource-exhausted',
          'You have reached your daily regeneration limit.',
        );
      }
      if (err instanceof z.ZodError) {
        throw new HttpsError('invalid-argument', 'Invalid regeneration request.');
      }
      console.error('[regenerateRecipeFlow]', message);
      throw new HttpsError('internal', 'Recipe regeneration failed. Try again.');
    }
  },
);
