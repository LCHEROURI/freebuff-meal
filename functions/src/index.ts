/**
 * Functions entry. Initializes Genkit's Vertex AI plugin once and exports
 * the genkit instance (`ai`) plus every callable flow.
 *
 * Flow files import `ai` from this module and call `ai.generate(...)` for
 * the LLM step — that's the documented high-level surface in genkit 1.x.
 * The bare `generate(...)` export from `@genkit-ai/ai` is the low-level
 * registry-based API and requires a `Registry` as its first arg.
 */
import { genkit } from 'genkit';
import { vertexAI } from '@genkit-ai/vertexai';

import { generateMealPlanFlow } from './ai/flows/generateMealPlanFlow.js';
import { regenerateRecipeFlow } from './ai/flows/regenerateRecipeFlow.js';
import { createShare, revokeShare } from './sharing/sharingFlows.js';
import { purgeUserData, onAuthUserDeleted } from './auth/userDeletion.js';
import { config } from './config/index.js';

export const ai = genkit({
  plugins: [vertexAI({ location: config.region })],
});

export {
  generateMealPlanFlow,
  regenerateRecipeFlow,
  createShare,
  revokeShare,
  purgeUserData,
  onAuthUserDeleted,
};
