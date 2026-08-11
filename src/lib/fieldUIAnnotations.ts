import type { z } from 'zod';

/**
 * Generic factory: given a ZodObject schema and a declarative config of
 * which fields are "comma-list" vs "paragraph" voice-append targets,
 * returns a normalized separator map plus two lookup helpers.
 *
 * Meant to be called once per form surface:
 *
 * ```ts
 * export const recipeFieldUI = makeFieldUIAnnotations(RecipeSchema, {
 *   paragraphFields: ['leftoverInstructions'],
 * });
 * ```
 *
 * The `schema` parameter drives TS inference so every field name in the
 * config is statically checked against `z.infer<typeof schema>`. A typo
 * is a compile error.
 */
export interface FieldUIAnnotationsConfig<T extends z.ZodObject<any>> {
  commaListFields?: ReadonlyArray<keyof z.infer<T>>;
  paragraphFields?: ReadonlyArray<keyof z.infer<T>>;
}

export interface FieldUIAnnotations<F extends string> {
  map: Partial<Record<F, string>>;
  resolve: (field: F) => string | undefined;
  isVoiceAppend: (field: F) => boolean;
}

export const COMMA_LIST_SEPARATOR = ', ';
export const PARAGRAPH_SEPARATOR = '\n';

export const makeFieldUIAnnotations = <T extends z.ZodObject<any>>(
  schema: T,
  config: FieldUIAnnotationsConfig<T>,
): FieldUIAnnotations<keyof z.infer<T> & string> => {
  type Field = keyof z.infer<T> & string;

  const map: Partial<Record<Field, string>> = {};

  for (const f of config.commaListFields ?? []) {
    map[f as Field] = COMMA_LIST_SEPARATOR;
  }
  for (const f of config.paragraphFields ?? []) {
    map[f as Field] = PARAGRAPH_SEPARATOR;
  }

  const resolve = (field: Field): string | undefined => map[field];
  const isVoiceAppend = (field: Field): boolean => map[field] !== undefined;

  return { map, resolve, isVoiceAppend };
};
