import { Input, type InputProps } from './Input';
import { Textarea, type TextareaProps } from './Input';
import type { MealPlanGenerationInput } from '@/schemas/mealPlan';
import { resolveMealPlanVoiceSeparator } from '@/lib/mealPlanFieldUI';

/**
 * Typed wrapper around the existing `<Input>` markup primitive.
 *
 * Why it exists (PR #49): the prior convention was to opt every
 * comma-list field into additive voice input by passing
 * `voiceAppendSeparator=", "` at each call site. That scattered the
 * separator decision across every `<Input>` in the wizard — easy
 * to forget, impossible to audit from the schema.
 *
 * `<FormInput/>` flips the choice: the caller names the *schema
 * field* (`field="pantryIngredients"`), and the wrapper resolves the
 * correct separator from the source-of-truth map in
 * `src/lib/mealPlanFieldUI.ts`. Single-item fields keep their
 * default replace-with-latest-final behavior; additive voice fields
 * pick up the right separator without the caller having to repeat
 * `", "` everywhere.
 *
 * The wrapper is a pure pass-through around `<Input>` — every
 * `InputProps` surface (label, hint, error, leftIcon, rightIcon,
 * register(), etc.) is preserved. The only thing it owns is the
 * voice-separator resolution.
 */

export type FormInputProps = Omit<InputProps, 'voiceAppendSeparator'> & {
  /**
   * The MealPlan schema field this input binds to. Drives both the
   * `voiceAppendSeparator` lookup and the TS-side typing so a
   * future schema refactor surfaces a type error here rather than
   * silently passing the wrong separator.
   */
  field: keyof MealPlanGenerationInput;
};

export const FormInput = ({ field, ...rest }: FormInputProps) => {
  const separator = resolveMealPlanVoiceSeparator(field);
  return <Input voiceAppendSeparator={separator} {...rest} />;
};

/**
 * Typed wrapper around `<Textarea>`. Same rationale as `<FormInput/>`
 * but for prose fields where the separator is `'\n'` (paragraph
 * delimiter) rather than `', '` (list delimiter).
 *
 * Notes is the current caller; future prose fields (e.g. per-step
 * cooking notes) drop in via the same map.
 */
export type FormTextareaProps = Omit<TextareaProps, 'voiceAppendSeparator'> & {
  field: keyof MealPlanGenerationInput;
};

export const FormTextarea = ({ field, ...rest }: FormTextareaProps) => {
  const separator = resolveMealPlanVoiceSeparator(field);
  return <Textarea voiceAppendSeparator={separator} {...rest} />;
};
