import { Input, type InputProps } from './Input';
import { Textarea, type TextareaProps } from './Input';
import type { FieldUIAnnotations } from '@/lib/fieldUIAnnotations';

/**
 * Typed wrappers around `<Input>` / `<Textarea>` that resolve the
 * correct `voiceAppendSeparator` from a field-UI annotation map so
 * call sites never repeat a raw separator string.
 *
 * Usage:
 *   `<FormInput fieldUI={ui} field="notes" {...register('notes')} />`
 *   `<FormTextarea fieldUI={ui} field="notes" {...register('notes')} />`
 */

export interface FormInputProps<F extends string = string>
  extends Omit<InputProps, 'voiceAppendSeparator'> {
  fieldUI: FieldUIAnnotations<F>;
  field: F;
}

export const FormInput = <F extends string>({
  fieldUI,
  field,
  ...rest
}: FormInputProps<F>) => {
  const separator = fieldUI.resolve(field);
  return <Input voiceAppendSeparator={separator} {...rest} />;
};

export interface FormTextareaProps<F extends string = string>
  extends Omit<TextareaProps, 'voiceAppendSeparator'> {
  fieldUI: FieldUIAnnotations<F>;
  field: F;
}

export const FormTextarea = <F extends string>({
  fieldUI,
  field,
  ...rest
}: FormTextareaProps<F>) => {
  const separator = fieldUI.resolve(field);
  return <Textarea voiceAppendSeparator={separator} {...rest} />;
};
