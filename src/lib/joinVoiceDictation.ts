/**
 * Pure helper for additive voice-dictation joining.
 *
 * Used by `<VoiceInputButton/>` when the host input has opted into
 * additive voice behavior via the `data-voice-separator` attribute.
 * Behavior:
 *
 *  - If `prior` is the empty string, `inserted` is returned untouched
 *    (so the first dictation writes cleanly with no leading separator).
 *  - Trailing whitespace, comma, or semicolon on `prior` is trimmed
 *    before joining so a second voice tap against `"chicken,"` (or
 *    `"chicken "` or `"chicken; "`) does NOT accumulate a double
 *    separator.
 *  - Leading whitespace, comma, or semicolon on `inserted` is trimmed
 *    (the W3C SR engine's `isFinal` text trimming is uneven across
 *    Chromium / Edge / Safari — a tap can land with `", tomato"`,
 *    `",tomato"`, or `" tomato"` and the joiner handles all three).
 *  - Trailing sentence-period on `prior` is PRESERVED (`"."` is not in
 *    the trim class). The visible artifact `"chicken., tomato"` is
 *    acceptable because the field is a free-text list, not a sentence.
 *    Choosing to strip `.` would risk clipping a meaningful terminator
 *    a cook actually wanted, and on real inputs the cook typically
 *    speaks a trailing comma for "more items" rather than a period.
 *
 * Kept as a top-level pure module (no React, no DOM) so it sits
 * alongside `useSpeech.ts` in `src/lib/` and is testable without
 * mocking the SpeechRecognition API. Keep this file dependency-free.
 */
export const joinVoiceDictation = (
  prior: string,
  inserted: string,
  separator: string,
): string => {
  const cleanedPrior = prior ? prior.replace(/[\s,;]+$/, '') : '';
  const cleanedIncoming = inserted.replace(/^[\s,;]+/, '');
  return cleanedPrior
    ? `${cleanedPrior}${separator}${cleanedIncoming}`
    : cleanedIncoming;
};
