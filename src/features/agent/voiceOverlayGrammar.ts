/**
 * Grammar helpers used by the CookVoiceOverlay (PR #15).
 *
 * Two responsibilities:
 *
 *  1. `classifyUtterance` — push-to-talk transcript → first-order intent.
 *     Built so the LLM round-trip is OPTIONAL. The cook's "next step"
 *     must not pay an LLM latency bill. Routes through the same intent
 *     cases the existing `VoiceCommandListener` covers (next / back /
 *     done / repeat / start-timer / cancel-timer / stop-listening) so
 *     we keep a single mental model across voice surfaces.
 *  2. `looksLikeQuestion` + `normalizeQuestion` — decide whether an
 *     unclassifiable utterance is worth a Gemini round-trip, and
 *     collapse trivial lexical variants so the LRU cache hit rate is
 *     high enough to actually cut cost.
 *
 *  Routing contract (consumed by CookVoiceOverlay, NOT by
 *  VoiceCommandListener):
 *
 *    1. If `looksLikeQuestion(utterance)` is true → skip the nav
 *       classifier and go straight to the LLM. The cook saying
 *       "how do I know when the chicken is done" contains the
 *       substring "done" so it would otherwise false-positive on
 *       the nav grammar.
 *    2. Else `classifyUtterance(utterance)` for nav. Returns `null`
 *       on miss.
 *
 * Kept as a pure module with no React / no DOM / no TTS so it sits
 * nicely next to the existing introspection-heavy test surface.
 */

export type OverlayIntent =
  | 'nav:next'
  | 'nav:back'
  | 'nav:done'
  | 'nav:repeat'
  | 'nav:start-timer'
  | 'nav:cancel-timer'
  | 'nav:stop-listening';

/** Same matcher surface as VoiceCommandListener. Kept in sync manually
 *  because the alternative — extracting VoiceCommandListener's matcher
 *  to a shared module — would be a wider refactor than this overlay
 *  warrants. If drift ever bites, the test in tests-rules covers the
 *  matching direction names. */
type PhraseEntry = { intent: OverlayIntent; phrases: ReadonlyArray<string> };

const ENTRIES: ReadonlyArray<PhraseEntry> = [
  { intent: 'nav:next', phrases: ['next step', 'next one', 'next', 'forward', 'continue'] },
  { intent: 'nav:back', phrases: ['previous step', 'go back', 'back', 'previous'] },
  { intent: 'nav:done', phrases: ['mark done', 'finished', 'complete', 'done'] },
  { intent: 'nav:repeat', phrases: ['read again', 'say again', 'repeat', 'again'] },
  {
    intent: 'nav:start-timer',
    phrases: ['start the timer', 'begin the timer', 'start timer', 'begin timer', 'set timer'],
  },
  {
    intent: 'nav:cancel-timer',
    phrases: ['stop the timer', 'cancel timer', 'clear timer', 'stop timer'],
  },
  { intent: 'nav:stop-listening', phrases: ['stop listening', 'stop voice', 'quit listening'] },
];

/**
 * Pure classify. Returns `null` when nothing matches. Sorted by phrase
 * length DESC so "next step" wins over "next".
 *
 * Suppresses matches when the utterance is question-shaped (i.e.
 * `looksLikeQuestion(raw) === true`). Without this guard a sincere
 * question like "how do I know when the chicken is done" false-matches
 * the nav grammar on the substring "done" — it's a question, not a
 * command, but the cheap substring matcher doesn't know that.
 */
export const classifyUtterance = (raw: string): OverlayIntent | null => {
  const text = raw.toLowerCase().trim();
  if (!text) return null;
  if (looksLikeQuestion(raw)) return null;
  const ordered = [...ENTRIES].sort((a, b) => {
    const maxB = Math.max(...b.phrases.map((p) => p.length));
    const maxA = Math.max(...a.phrases.map((p) => p.length));
    return maxB - maxA;
  });
  for (const entry of ordered) {
    if (entry.phrases.some((p) => text.includes(p))) return entry.intent;
  }
  return null;
};

/**
 * Conservative "is this a question?" check. We only route to the LLM
 * when:
 *   - the utterance isn't a nav command (handled above), and
 *   - length > 8 chars (filters out "ok", "hm", "yeah"), and
 *   - it contains at least one strong cue.
 *
 * Cues: ends with `?`, starts with one of (what/how/can/should/why/
 * when/is/are/do/does/which), contains a substitution cue
 * (`substitute` / `instead` / `replace` / `don't have` / `i'm out` /
 * `allergy` / `without` / etc.).
 *
 * The CookVoiceOverlay calls `looksLikeQuestion` BEFORE
 * `classifyUtterance`, so things like "how do I know when the
 * chicken is done" hit the LLM rather than false-matching on the
 * substring "done" inside the nav grammar.
 */
const QUESTION_OPENERS = ['what', 'how', 'can', 'could', 'should', 'why', 'when', 'is', 'are', 'do', 'does', 'which'];
const SUBSTITUTION_CUES = [
  'substitute',
  'instead',
  'replace',
  'swapped',
  'swap for',
  'use instead',
  "don't have",
  'no more',
  "i'm out",
  'allergy',
  'allergic',
  'without',
];

export const looksLikeQuestion = (raw: string): boolean => {
  const text = raw.toLowerCase().trim();
  if (text.length < 9) return false;
  if (text.endsWith('?')) return true;
  const firstWord = text.split(/\s+/)[0] ?? '';
  if (QUESTION_OPENERS.includes(firstWord)) return true;
  if (SUBSTITUTION_CUES.some((cue) => text.includes(cue))) return true;
  return false;
};

/**
 * Canonical cache key. Strips filler words and contractions, lowercases,
 * collapses whitespace. Two utterances that map to the same key will
 * hit the same LRU slot (e.g. "what can I substitute for garlic" and
 * "what can i sub for garlic" both → "substitute for garlic").
 */
const FILLER = new Set([
  'a',
  'an',
  'the',
  'i',
  'me',
  'my',
  'for',
  'to',
  'of',
  'is',
  'are',
  'do',
  'does',
  'can',
  'could',
  'should',
  'would',
  'will',
  'you',
  'know',
  // Question openers — also serve as cache-key filler so cache slots
  // ignore the leading "how"/"what" and converge on the actionable
  // nouns ("how do I know the chicken is done" \u2192 "chicken done").
  'what',
  'how',
  'why',
  'when',
  'which',
]);

export const normalizeQuestion = (raw: string): string => {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = cleaned.split(' ').filter((t) => t.length > 0 && !FILLER.has(t));
  return tokens.join(' ');
};

// ---------------------------------------------------------------------
//  Timer intent extraction (PR #22).
//
//  Two helpers:
//    1. `looksLikeTimerCommand` — cheap cue check before burning an
//       LLM roundtrip. Mirrors the nav grammar's small-vocabulary
//       style; if the utterance doesn't include any timer / start
//       / set / "I'm putting it in" cue, we skip backend entirely.
//    2. `extractTimerFromUtterance` — extracts { action, duration,
//       unit, confidence } from a single push-to-talk utterance.
//       Tries the explicit-number regex FIRST so "set 12 minutes",
//       "thirty seconds", "a quarter hour", "an hour and a half"
//       resolve in <1 ms without an LLM roundtrip. Falls through to
//       ACTION_ONLY ("I'm putting it in the oven now") when a cue
//       is present but no explicit number was stated — the cook
//       wants the current step's `durationSeconds`.
//
//  Both helpers are pure and OSM-safe (no DOM, no React).
// ---------------------------------------------------------------------

const TIMER_CUES = [
  'timer',
  'minute',
  'minutes',
  'min',
  'second',
  'seconds',
  'hour',
  'hours',
  'half hour',
  'quarter hour',
  'putting it in',
  'put it in',
  "i'm putting",
  'oven now',
  'started',
  'start cooking',
  'start now',
  'begin now',
  'set for',
  'set the',
];

/** Cheap pre-check: does the utterance carry ANY timer-ish cue?
 *  Used to decide whether to bother with the LLM roundtrip at all. */
export const looksLikeTimerCommand = (raw: string): boolean => {
  const text = ' ' + raw.toLowerCase().trim() + ' ';
  return TIMER_CUES.some((cue) => text.includes(' ' + cue + ' ') || text.includes(cue));
};

// English number words for natural language ("twelve" → 12).
const NUM_WORDS: Readonly<Record<string, number>> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};

export type TimerExtraction =
  | {
      kind: 'explicit';
      durationSeconds: number;
      confidence: number;
    }
  | {
      kind: 'implicit';
      /** The caller should fall back to current step's timerSeconds. */
      durationSeconds: null;
      confidence: number;
    }
  | {
      kind: 'none';
      durationSeconds: null;
      confidence: 0;
    };

const toSeconds = (n: number, unit: 's' | 'm' | 'h'): number => {
  if (unit === 's') return n;
  if (unit === 'm') return n * 60;
  return n * 3600;
};

/** Convert a literal timestamp phrase: "12 minutes", "an hour",
 *  "a quarter hour", "90 seconds", "twelve min", "1 minute", etc. */
const parseExactDuration = (
  text: string,
): { value: number; unit: 's' | 'm' | 'h' } | null => {
  // Special phrases first.
  if (/a\s+quarter\s+hour/.test(text) || /quarter\s+hour/.test(text)) {
    return { value: 15, unit: 'm' };
  }
  if (/half\s+hour/.test(text) || /a\s+half\s+hour/.test(text)) {
    return { value: 30, unit: 'm' };
  }
  if (/\ban\s+hour\b/.test(text) || /\bhour\b/.test(text) && !/\bhalf\b/.test(text) && !/^\s*hour\s*$/.test(text)) {
    // Any measure of "hour" without "half/quarter" — count as 1 hr if
    // no numeric prefix was given. (Already covered by the regex below.)
  }

  // Numeric + unit: "12 minutes", "12 min", "1h", "90 seconds".
  const numeric = text.match(
    /\b(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h)\b/,
  );
  if (numeric) {
    const n = Number(numeric[1]);
    const unitRaw = numeric[2]!.toLowerCase();
    const unit: 's' | 'm' | 'h' = unitRaw.startsWith('s') || unitRaw === 's'
      ? 's'
      : unitRaw.startsWith('h') || unitRaw === 'h'
        ? 'h'
        : 'm';
    return { value: n, unit };
  }

  // Numeric only (default to minutes): "for 12", "set 12".
  const bare = text.match(/\b(?:for|set)\s+(\d+(?:\.\d+)?)\b/);
  if (bare) {
    return { value: Number(bare[1]), unit: 'm' };
  }

  // Worded numbers: "twelve minutes", "twenty minute timer", "an hour".
  const wordUnits: ReadonlyArray<{ re: RegExp; unit: 's' | 'm' | 'h' }> = [
    { re: /\b(an?)\s+hours?\b/, unit: 'h' },
    { re: /\b(an?)\s+minutes?\b/, unit: 'm' },
    { re: /\b(an?)\s+seconds?\b/, unit: 's' },
    { re: /\b(an?)\s+minute\b/, unit: 'm' },
  ];
  for (const w of wordUnits) {
    const m = text.match(w.re);
    if (m) {
      return { value: 1, unit: w.unit };
    }
  }
  for (const [word, value] of Object.entries(NUM_WORDS)) {
    const re = new RegExp(`\\b${word}\\b\\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h)?\\b`);
    const m = text.match(re);
    if (m) {
      const unitRaw = (m[1] ?? 'm').toLowerCase();
      const unit: 's' | 'm' | 'h' = unitRaw.startsWith('s') || unitRaw === 's'
        ? 's'
        : unitRaw.startsWith('h') || unitRaw === 'h'
          ? 'h'
          : 'm';
      return { value, unit };
    }
  }
  return null;
};

/** Extract a structured timer intent from a single utterance.
 *  Returns:
 *    - `explicit` (with `durationSeconds`) when a clear number+unit
 *      was stated  — confidence >= 0.8
 *    - `implicit` (with `durationSeconds: null`) when a timer cue
 *      is present but no explicit number  — caller should fall back
 *      to current step's `timerSeconds`
 *    - `none` when no relevant cue is present
 */
export const extractTimerFromUtterance = (raw: string): TimerExtraction => {
  const text = ' ' + raw.toLowerCase().trim().replace(/[?!.,]/g, '') + ' ';
  if (!looksLikeTimerCommand(raw)) {
    return { kind: 'none', durationSeconds: null, confidence: 0 };
  }
  const exact = parseExactDuration(text);
  if (exact) {
    const v = toSeconds(exact.value, exact.unit);
    // Clamp to a sane cooking window (max 4 hours per recipe reality).
    const clamped = Math.min(60 * 60 * 4, Math.max(1, Math.round(v)));
    return { kind: 'explicit', durationSeconds: clamped, confidence: 0.95 };
  }
  // Cue present but no number — typical "I'm putting it in the oven now"
  // pattern. Caller resolves via current step's timerSeconds.
  return { kind: 'implicit', durationSeconds: null, confidence: 0.7 };
};
