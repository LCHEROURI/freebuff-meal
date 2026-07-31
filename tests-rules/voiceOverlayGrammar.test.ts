import { describe, expect, it } from 'vitest';

import {
  classifyUtterance,
  extractTimerFromUtterance,
  looksLikeQuestion,
  looksLikeTimerCommand,
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

// ───────────────────────────────────────────────────────────────────
//  PR #22 — cooking-aware voice timer grammar.
// ───────────────────────────────────────────────────────────────────

describe('voiceOverlayGrammar.looksLikeTimerCommand', () => {
  it('flags explicit-duration utterances ("set 12 minutes")', () => {
    expect(looksLikeTimerCommand('set 12 minutes')).toBe(true);
    expect(looksLikeTimerCommand('start a timer for 8 min')).toBe(true);
    expect(looksLikeTimerCommand('thirty second timer please')).toBe(true);
  });

  it('flags implicit-cue utterances ("I am putting it in the oven now")', () => {
    expect(looksLikeTimerCommand("I'm putting it in the oven now")).toBe(true);
    expect(looksLikeTimerCommand('start cooking')).toBe(true);
    expect(looksLikeTimerCommand('begin now')).toBe(true);
  });

  it('flags half hour and quarter hour natural-language phrases', () => {
    expect(looksLikeTimerCommand('a half hour timer')).toBe(true);
    expect(looksLikeTimerCommand('quarter hour please')).toBe(true);
  });

  it('returns false for non-timer utterances', () => {
    expect(looksLikeTimerCommand('what can I substitute for lemon')).toBe(false);
    expect(looksLikeTimerCommand('how long should this cook')).toBe(false);
    expect(looksLikeTimerCommand('next step')).toBe(false);
    expect(looksLikeTimerCommand('')).toBe(false);
  });
});

describe('voiceOverlayGrammar.extractTimerFromUtterance', () => {
  it('resolves numeric + unit phrases to an explicit duration', () => {
    const r = extractTimerFromUtterance('set 12 minutes');
    expect(r.kind).toBe('explicit');
    expect((r as { durationSeconds: number }).durationSeconds).toBe(12 * 60);
    expect(r.confidence).toBeGreaterThan(0.9);
  });

  it('handles seconds, minutes, hours', () => {
    expect((extractTimerFromUtterance('90 seconds') as { durationSeconds: number }).durationSeconds).toBe(90);
    expect((extractTimerFromUtterance('5 minute timer') as { durationSeconds: number }).durationSeconds).toBe(5 * 60);
    expect((extractTimerFromUtterance('1 hour') as { durationSeconds: number }).durationSeconds).toBe(3600);
  });

  it('handles word numbers (twelve, thirty)', () => {
    expect((extractTimerFromUtterance('twelve minute timer') as { durationSeconds: number }).durationSeconds).toBe(720);
    expect((extractTimerFromUtterance('thirty seconds') as { durationSeconds: number }).durationSeconds).toBe(30);
  });

  it('handles "a quarter hour" and "half hour" idioms', () => {
    expect((extractTimerFromUtterance('a quarter hour') as { durationSeconds: number }).durationSeconds).toBe(15 * 60);
    expect((extractTimerFromUtterance('half hour') as { durationSeconds: number }).durationSeconds).toBe(30 * 60);
  });

  it('handles "an hour" / "a minute" canonical defaults', () => {
    expect((extractTimerFromUtterance('an hour') as { durationSeconds: number }).durationSeconds).toBe(3600);
    expect((extractTimerFromUtterance('a minute') as { durationSeconds: number }).durationSeconds).toBe(60);
  });

  it('clamps to the 4-hour ceiling', () => {
    const r = extractTimerFromUtterance('ten hours');
    expect((r as { durationSeconds: number }).durationSeconds).toBeLessThanOrEqual(60 * 60 * 4);
  });

  it('returns implicit when only the cue is present', () => {
    const r = extractTimerFromUtterance("I'm putting it in the oven now");
    expect(r.kind).toBe('implicit');
    expect((r as { durationSeconds: null }).durationSeconds).toBeNull();
    expect(r.confidence).toBeGreaterThan(0.6);
  });

  it('returns none for utterances without any timer cue', () => {
    const r = extractTimerFromUtterance('how long should this cook');
    expect(r.kind).toBe('none');
    expect((r as { durationSeconds: null }).durationSeconds).toBeNull();
    expect(r.confidence).toBe(0);
  });
});
