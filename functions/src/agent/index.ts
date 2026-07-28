/**
 * Cooking-agent public surface.
 *
 * One barrel file that the umbrella `functions/src/index.ts` imports
 * to register every onCall handler. Adding a new tool requires only:
 *   1. Define the onCall in `cookingTools.ts`
 *   2. Re-export it here
 *   3. (Optional) add a tool name to `TOOL_NAMES` in `schemas.ts`
 */
export {
  saveAvailableIngredients,
  updateAvailableIngredients,
  generateRecipe,
  validateRecipe,
  startCookingSession,
  getCurrentStep,
  completeCurrentStep,
  repeatCurrentStep,
  previousStep,
  replaceIngredient,
  resizeRecipe,
  startTimer,
  pauseCookingSession,
  resumeCookingSession,
  endCookingSession,
  extractIngredientsFromSpeech,
} from './cookingTools.js';

export { transition, legalTransitions, pausePreservePhase } from './stateMachine.js';
export type { SessionTrigger } from './stateMachine.js';
