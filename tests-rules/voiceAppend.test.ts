/**
 * Test surface for the pure `<VoiceInputButton/>` joiner.
 *
 * `joinVoiceDictation(prior, inserted, separator)` is the additive
 * logic invoked when a host input opts into voice-stacking via the
 * `data-voice-separator` attribute. Extracted as a pure module so
 * these edge cases can be pinned without DOM mocking or
 * SpeechRecognition polyfills.
 *
 * The seven exercises below mirror the realistic chrome variants
 * the cook hits in the kitchen:
 *
 *   1. Empty prior — first dictation writes cleanly.
 *   2. Trailing comma on prior — second tap joins without doubling.
 *   3. Trailing whitespace on prior — same.
 *   4. Trailing sentence-period on prior — preserved by design.
 *   5. Mixed separators (`", ` then `;`) — all of [\s,;]+ collapse.
 *   6. Multi-segment continuation — leading separator on the
 *      dictated utterance is stripped (SR engines land `", tomato"`,
 *      `" ,tomato"`, or `" tomato"` interchangeably).
 *   7. Separator with whitespace `", "` — the joiner places the
 *      raw separator verbatim (whitespace lives inside the separator
 *      string, NOT inside the join function).
 */
import { describe, expect, it } from 'vitest';

import { joinVoiceDictation } from '../src/lib/joinVoiceDictation.ts';

describe('joinVoiceDictation', () => {
  it('returns the inserted text when prior is empty (no leading separator)', () => {
    expect(joinVoiceDictation('', 'chicken', ', ')).toBe('chicken');
    expect(joinVoiceDictation('', 'I have chicken.', ', ')).toBe(
      'I have chicken.',
    );
  });

  it('trims trailing comma on prior so second tap does not double', () => {
    expect(joinVoiceDictation('chicken,', 'tomato', ', ')).toBe(
      'chicken, tomato',
    );
    expect(joinVoiceDictation('chicken,,', 'tomato', ', ')).toBe(
      'chicken, tomato',
    );
  });

  it('trims trailing whitespace on prior', () => {
    expect(joinVoiceDictation('chicken ', 'tomato', ', ')).toBe(
      'chicken, tomato',
    );
    expect(joinVoiceDictation('chicken  ', 'tomato', ', ')).toBe(
      'chicken, tomato',
    );
    expect(joinVoiceDictation('chicken\t', 'tomato', ', ')).toBe(
      'chicken, tomato',
    );
  });

  it('preserves trailing sentence-period on prior', () => {
    // Period is not in [\s,;] so "I have chicken." stays intact and
    // a subsequent tap joins with the configured separator. The
    // cosmetic artifact "chicken., tomato" is acceptable given the
    // field is a free-text list, not a sentence — cook who wants
    // a clean join can speak a trailing comma instead.
    expect(joinVoiceDictation('I have chicken.', 'tomato', ', ')).toBe(
      'I have chicken., tomato',
    );
  });

  it('collapses mixed trailing whitespace+comma+semicolon', () => {
    expect(joinVoiceDictation('chicken; ', 'tomato', ', ')).toBe(
      'chicken, tomato',
    );
    expect(joinVoiceDictation('chicken , ', 'tomato', ', ')).toBe(
      'chicken, tomato',
    );
    expect(joinVoiceDictation('chicken\t;\t', 'tomato', ', ')).toBe(
      'chicken, tomato',
    );
  });

  it('strips leading separator on inserted text (SR engine variability)', () => {
    // The dictated landing can be one of:
    //   ", tomato"  (Edge sometimes when buffer rejoins)
    //   ",tomato"   (Safari iOS tight variant)
    //   " tomato"   (Chrome clean variant)
    // All three should join cleanly without a doubled separator.
    expect(joinVoiceDictation('chicken', ', tomato', ', ')).toBe(
      'chicken, tomato',
    );
    expect(joinVoiceDictation('chicken', ',tomato', ', ')).toBe(
      'chicken, tomato',
    );
    expect(joinVoiceDictation('chicken', ' tomato', ', ')).toBe(
      'chicken, tomato',
    );
  });

  it('passes the separator verbatim so whitespace stays inside the separator string', () => {
    // Comma+space — the canonical pantry separator.
    expect(joinVoiceDictation('chicken', 'tomato', ', ')).toBe(
      'chicken, tomato',
    );
    // Newline — if a future "Notes" textarea opts in with "\n", each
    // line justified properly.
    expect(joinVoiceDictation('first line', 'second line', '\n')).toBe(
      'first line\nsecond line',
    );
    // Single character — bare comma without surrounding spaces.
    expect(joinVoiceDictation('a', 'b', ',')).toBe('a,b');
  });

  it('joins single characters across a separator (smallest-possible case)', () => {
    // Floor-pin: the unit-char + unit-char case is the smallest
    // possible join and would catch any future regex tweak that
    // accidentally doubles a separator when both sides are short.
    expect(joinVoiceDictation('a', 'b', ', ')).toBe('a, b');
    expect(joinVoiceDictation('x', 'y', ' + ')).toBe('x + y');
  });
});
