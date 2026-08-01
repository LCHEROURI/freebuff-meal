import type { MealPlanGenerationInput } from '@/schemas/mealPlan';

/**
 * Source-of-truth map: for every MealPlan schema field, what
 * separator (if any) the adjacent `<VoiceInputButton/>` should use
 * when appending dictated utterances to the existing value.
 *
 *   '* comma-list     -> '  (e.g. "chicken", "chicken, tomatoes")
 *   '* paragraph     -> '\n' (e.g. "first paragraph\nsecond paragraph")
 *   undefined         -> no separator from the native Speech API; each
 *                         dictated result replaces the field (current
 *                         default behavior for single-line Inputs and
 *                         for chip-tray toggles).
 *
 * Auditing: any reader grepping the schema for `pantryIngredients`
 * can land here and see the *exact* voice contract the wizard field
 * promises, instead of hoping every call site remembered to set
 * `voiceAppendSeparator=", "` consistently. New fields that should
 * accumulate need one entry here and one `<FormInput/>` swap in the
 * wizard — no per-call-site repetition to forget.
 *
 * Co-located with the schema (not inside `Input.tsx`) because the
 * decision belongs to the *data*, not the markup primitive.
 */
export const MEAL_PLAN_VOICE_SEPARATOR: Partial<
  Record<keyof MealPlanGenerationInput, string>
> = {
  pantryIngredients: ', ',
  useSoonIngredients: ', ',
  excludedIngredients: ', ',
  notes: '\n',
};

/**
 * Pure lookup. Returns `undefined` for fields that should keep the
 * default replace-with-last-final behavior — single-item fields,
 * numeric fields, and chip-tray styles aren't voice-append targets.
 */
export const resolveMealPlanVoiceSeparator = (
  field: keyof MealPlanGenerationInput,
): string | undefined => MEAL_PLAN_VOICE_SEPARATOR[field];

/**
 * Did this schema field opt in to additive voice input? Lets the
 * FormInput/FormTextarea wrappers render the matching
 * `data-voice-separator` attribute without leaking the separator
 * value to the consumer.
 */
export const isVoiceAppendMealPlanField = (
  field: keyof MealPlanGenerationInput,
): boolean => MEAL_PLAN_VOICE_SEPARATOR[field] !== undefined;
