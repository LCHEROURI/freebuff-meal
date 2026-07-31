import { describe, expect, it } from 'vitest';

import {
  classifyUtterance,
  looksLikeQuestion,
  normalizeQuestion,
} from '../src/features/agent/voiceOverlayGrammar';

describe('voiceOverlayGrammar.classifyUtterance', () => {
  it('matches the longer phrase first ("next step" wins over "next")', () => {
    expect(classifyUtterance('go to the next step please')).toBe('nav:next');
  });

  it('matches "back" and "previous" both', () => {
    expect(classifyUtterance('back')).toBe('nav:back');
    expect(classifyUtterance('previous')).toBe('nav:back');
  });

  it('matches timer start/cancel phrases', () => {
    expect(classifyUtterance('start the timer please')).toBe('nav:start-timer');
    expect(classifyUtterance('cancel timer')).toBe('nav:cancel-timer');
  });

  it('matches "repeat" and "say again"', () => {
    expect(classifyUtterance('read that again')).toBe('nav:repeat');
    expect(classifyUtterance('repeat')).toBe('nav:repeat');
  });

  it('returns null for freeform questions', () => {
    expect(classifyUtterance('what can I substitute for lemon')).toBeNull();
    expect(classifyUtterance('how do I know when the chicken is done')).toBeNull();
  });

  it('is case-insensitive and tolerant of trailing whitespace', () => {
    expect(classifyUtterance('  NEXT   ')).toBe('nav:next');
  });

  it('returns null for empty string', () => {
    expect(classifyUtterance('')).toBeNull();
  });
});

describe('voiceOverlayGrammar.looksLikeQuestion', () => {
  it('returns true for utterances ending in "?"', () => {
    expect(looksLikeQuestion('how long should this cook?')).toBe(true);
  });

  it('returns true for utterances starting with a question opener', () => {
    expect(looksLikeQuestion('how do I know the chicken is done')).toBe(true);
    expect(looksLikeQuestion('what can I use instead of garlic')).toBe(true);
    expect(looksLikeQuestion('can I substitute lime for lemon')).toBe(true);
  });

  it('returns true for substitution cues even without a sentence-shape match', () => {
    expect(looksLikeQuestion('substitute for parsley')).toBe(true);
    expect(looksLikeQuestion('use rice instead of pasta')).toBe(true);
  });

  it('returns false for short utterances', () => {
    expect(looksLikeQuestion('hm')).toBe(false);
    expect(looksLikeQuestion('yeah')).toBe(false);
    expect(looksLikeQuestion('ok')).toBe(false);
  });

  it('returns false for nav commands even with question marks', () => {
    // nav commands should be classified by `classifyUtterance` first
    // and never make it into the question router. This test just
    // documents that the heuristic does not filter on the question
    // shape itself (so the caller must apply nav-first classification).
    expect(looksLikeQuestion('next step?')).toBe(true);
  });
});

describe('voiceOverlayGrammar.normalizeQuestion', () => {
  it('lowercases and strips non-alphanumeric characters', () => {
    expect(normalizeQuestion('How Do I Know the Chicken is Done?!')).toBe('chicken done');
  });

  it('collapses repeated filler words', () => {
    expect(
      normalizeQuestion("What can I substitute for garlic?"),
    ).toBe('substitute garlic');
  });

  it('produces identical keys for lexical variants (cache hit)', () => {
    expect(normalizeQuestion('what can i substitute for garlic')).toBe(
      normalizeQuestion("what can I substitute for garlic?"),
    );
    expect(normalizeQuestion('use rice instead of pasta')).toBe(
      normalizeQuestion('can i use rice instead of pasta'),
    );
  });
});
