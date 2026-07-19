/**
 * Centralized server-side configuration.
 *
 * Tunable values that are referenced from runtime code live here. The
 * `modelName` and `promptVersion` strings were removed in the genkit 1.x
 * migration because flow files now pin to the `@genkit-ai/vertexai` export
 * `gemini20Flash` directly and read prompt content from
 * `prompts/system.ts` — adding a config layer between would have hidden
 * the wiring without giving us runtime flexibility.
 */
export const config = {
  rateLimits: {
    fullPlanPerDay: 10,
    recipeRegenPerDay: 30,
    fullPlanCooldownSeconds: 15,
    maxPlanLength: 7,
    maxFreeTextChars: 2000,
    maxPantryItems: 40,
    maxExcludedItems: 40,
    maxResponseBytes: 256_000,
  },
  region: 'us-central1',
} as const;

export type AppConfig = typeof config;
