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
