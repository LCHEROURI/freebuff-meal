/**
 * generateMealPlanFlow — production entry point.
 *
 * Uses raw `onCall` from `firebase-functions/v2/https` so auth.uid, App
 * Check, and rate-limit enforcement are decoupled from any drift in the
 * `@genkit-ai/firebase` callable wrapper. Genkit is used purely for the
 * LLM orchestration step inside the handler.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { gemini20Flash } from '@genkit-ai/vertexai';
import { z } from 'zod';

import { ai } from '../../index.js';
import { PROMPT_VERSION, SYSTEM_PROMPT_V2 } from '../prompts/system.js';
import {
  MealPlanGenerationInputSchema,
  MealPlanSchema,
} from '../schemas/index.js';
import { checkRateLimit } from '../../rate-limits/usage.js';
import {
  STAMPED_MODEL_NAME,
  stampGenerationMetadata,
} from '../audit/stamp.js';

const apiKey = defineSecret('GOOGLE_API_KEY');

export const generateMealPlanFlow = onCall(
  { enforceAppCheck: true, secrets: [apiKey] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in to generate a plan.');
    }

    try {
      const input = MealPlanGenerationInputSchema.parse(request.data);
      await checkRateLimit(uid, 'plan');
      // Wall-clock anchor for server-stamped `durationMs` — captures
      // the user-visible latency of the whole flow (auth + App Check +
      // rate-limit + 1–2 Genkit calls).
      const startedAtMs = Date.now();

      const result = await ai.generate({
        model: gemini20Flash,
        prompt: `${SYSTEM_PROMPT_V2}\n\nUSER INPUT:\n${JSON.stringify(input)}`,
        output: { schema: MealPlanSchema as unknown as z.ZodTypeAny },
        config: { temperature: 0.5, maxOutputTokens: 4096 },
      });

      const parsed = MealPlanSchema.safeParse(result.output);
      if (!parsed.success) {
        // Repair-once retry with a corrective system prompt. Uses V2 so a
        // stale repair can't reintroduce the missing fields the V1 fix
        // addressed (Cook Mode timers + honest substitution ratios).
        const repair = await ai.generate({
          model: gemini20Flash,
          prompt: `${SYSTEM_PROMPT_V2}\n\nThe previous response did not validate. Errors: ${parsed.error.message}\n\nUSER INPUT:\n${JSON.stringify(input)}`,
          output: { schema: MealPlanSchema as unknown as z.ZodTypeAny },
          config: { temperature: 0.3, maxOutputTokens: 4096 },
        });
        const repaired = MealPlanSchema.safeParse(repair.output);
        if (!repaired.success) {
          // `'failed'` only survives into a logged metric; the public
          // caller sees a generic `internal` HttpsError. Surfacing
          // `repaired: false` to the client would let users infer
          // internal prompt drift, which we don't want.
          console.warn('[generateMealPlanFlow] generation failed validation', {
            uid,
            modelName: STAMPED_MODEL_NAME,
            promptVersion: PROMPT_VERSION,
            retryCount: 1,
            validation: 'failed',
            durationMs: Date.now() - startedAtMs,
            planLength: input.planLength,
            dietaryPattern: input.dietaryPattern,
            firstPassError: parsed.error.message,
            repairPassError: repaired.error.message,
          });
          throw new HttpsError('internal', 'AI returned an invalid plan after retry.');
        }
        return {
          plan: stampGenerationMetadata(repaired.data, {
            durationMs: Date.now() - startedAtMs,
            retryCount: 1,
            validation: 'repaired',
          }),
        };
      }
      return {
        plan: stampGenerationMetadata(parsed.data, {
          durationMs: Date.now() - startedAtMs,
          retryCount: 0,
          validation: 'passed',
        }),
      };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith('RATE_LIMIT_COOLDOWN_')) {
        throw new HttpsError(
          'resource-exhausted',
          'Please wait a few seconds before generating another plan.',
        );
      }
      if (message.startsWith('RATE_LIMIT_DAILY_')) {
        throw new HttpsError(
          'resource-exhausted',
          'You have reached your daily plan-generation limit.',
        );
      }
      if (err instanceof z.ZodError) {
        throw new HttpsError('invalid-argument', 'Invalid plan input.');
      }
      // Never leak internal details; surface a generic message + log server-side.
      console.error('[generateMealPlanFlow]', message);
      throw new HttpsError('internal', 'Plan generation failed. Try again.');
    }
  },
);

export type GenerateMealPlanInput = z.infer<typeof MealPlanGenerationInputSchema>;
