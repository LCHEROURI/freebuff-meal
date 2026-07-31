import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Mic, MicOff, Sparkles, Volume2, X, RefreshCcw } from 'lucide-react';

import { Button } from '@/components/common/Button';
import { useToast } from '@/components/common/Toast';
import { useSpeechDictation, useSpeechSynthesis } from '@/lib/useSpeech';
import { agentClient } from './agentClient';
import { AnswerLru } from './answerLru';
import {
  classifyUtterance,
  looksLikeQuestion,
  normalizeQuestion,
  type OverlayIntent,
} from './voiceOverlayGrammar';

/**
 * CookVoiceOverlay (PR #15).
 *
 * Hands-free face for the cook. Mounts INSIDE CookModePage (NOT a new
 * route) so the existing step progression, voice commands, per-step
 * timers, and persistence all keep working unchanged.
 *
 * Architecture:
 *   - Push-to-talk (PTT) — primary input. We do NOT keep the mic
 *     open while TTS is speaking, because most browsers either refuse
 *     to start SR while `speechSynthesis` is active or capture the
 *     agent's own audio → false-positive intents. Kitchen noise
 *     compounds the problem.
 *   - Six-state FSM (IDLE → OPENING → LISTENING_NAV → LISTENING_QUESTION
 *     → THINKING → READING_REPLY → LISTENING_NAV). Transitions are
 *     effect-driven against the live TTS `speaking` boolean and the
 *     STT `finalTranscript` signal. The graph is small enough to
 *     audit at code review.
 *   - Grammar-first router — `classifyUtterance` matches nav commands
 *     in <1 ms without leaving the browser. The LLM is touched ONLY
 *     when the utterance fails grammar AND passes
 *     `looksLikeQuestion()`. Roughly 80% of cook speech at the
 *     stove is nav, so this cuts the LLM tax to a fraction.
 *   - LRU cache per cooking session — a repeat "how do I know the
 *     chicken is done?" serves from memory in <30 ms. Bounded to 20
 *     entries, 30-min TTL. Cleared on overlay close.
 *   - Hard guard — `useSpeechSynthesis` cancel-on-unmount cleans up
 *     on every navigation; `useSpeechDictation` aborts on its
 *     ref; explicit mutex: starting SR is only allowed when
 *     `speech.speaking === false`. Documented in the relevant
 *     effects.
 *
 * Not used in the wizard pre-cook stages (CAPTURE / CONFIRM /
 * REQUIREMENTS / RECIPE_READY). The cooking session is where hands
 * are wet and screen is hardest to read.
 */

export type CookVoiceStep = {
  stepNumber: number;
  phase: 'preparation' | 'cooking' | 'presentation';
  text: string;
  spokenText: string;
};

export type CookVoiceOverlayProps = {
  sessionId: string;
  recipeName: string;
  currentStep: CookVoiceStep | null;
  isOpen: boolean;
  onClose: () => void;
  /**
   * Called when the PTT utterance matched a known nav intent
   * (next / back / repeat / done / start-timer / cancel-timer).
   * The host (CookModePage) is the source of truth for advancing
   * stepIndex; this overlay only translates voice → intent.
   */
  onNav: (intent: OverlayIntent) => void;
};

type FsmState =
  | 'IDLE'
  | 'OPENING'
  | 'LISTENING_NAV'
  | 'LISTENING_QUESTION'
  | 'THINKING'
  | 'READING_REPLY';

const CACHE_MAX = 20;
const CACHE_TTL_MS = 30 * 60 * 1000;

type CachedReply = { answer: string; followUp: string | null };

export const CookVoiceOverlay = ({
  sessionId,
  recipeName,
  currentStep,
  isOpen,
  onClose,
  onNav,
}: CookVoiceOverlayProps): ReactNode | null => {
  const toast = useToast();
  const speech = useSpeechSynthesis();
  const dictation = useSpeechDictation();

  const [fsm, setFsm] = useState<FsmState>('IDLE');
  const [recordedUtterance, setRecordedUtterance] = useState<string>('');
  const [lastReply, setLastReply] = useState<
    | (CachedReply & {
        source: 'fresh' | 'cache';
        question: string;
      })
    | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  // Per-overlay cache survives multiple utterance cycles within the
  // session. Recreated on close so a fresh session starts cold.
  const cacheRef = useRef<AnswerLru<CachedReply>>(
    new AnswerLru<CachedReply>({ maxEntries: CACHE_MAX, ttlMs: CACHE_TTL_MS }),
  );

  // Track which utterance we're currently processing so a stale
  // late-arriving `finalTranscript` doesn't re-route.
  const processingRef = useRef<boolean>(false);

  // ──────────────────────────────────────────────────────────────────
  //  Boot / teardown
  // ──────────────────────────────────────────────────────────────────

  // On close: cancel TTS, stop SR, drop cache. Strict-mode safe.
  useEffect(() => {
    if (isOpen) return;
    speech.cancel();
    dictation.stop();
    cacheRef.current.clear();
    processingRef.current = false;
    setFsm('IDLE');
    setRecordedUtterance('');
    setLastReply(null);
    setError(null);
  }, [isOpen, speech, dictation]);

  // a11y: Escape closes; focus is parked inside the overlay while
  // open; Tab cycles inside. Without these, screen-reader and
  // keyboard-only cooks could Escape but couldn't reach the mic.
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // On open: snap focus to the first focusable so the trap engages
  // immediately (otherwise Tab leaves until you press it once).
  useEffect(() => {
    if (!isOpen) return;
    const raf = window.requestAnimationFrame(() => {
      const root = overlayRef.current;
      if (!root) return;
      const first = root.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (first instanceof HTMLElement) first.focus();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [isOpen]);

  // Tab / Shift+Tab cycling + Escape. Also snaps focus back inside
  // the overlay if the user landed on `body` or an element outside
  // the trap (otherwise Tab can silently leave the overlay even with
  // a focus boundary marked).
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = overlayRef.current;
      if (!root) return;
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement;
      // Active focus outside the overlay — snap it back to first.
      if (!(active instanceof HTMLElement) || !root.contains(active)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // ──────────────────────────────────────────────────────────────────
  //  PTT mic lifecycle
  // ──────────────────────────────────────────────────────────────────

  // Hard mutex: never start STT while TTS is active.
  const startMic = useCallback((): void => {
    if (speech.speaking) {
      // Defer until TTS settles; the watcher above will retry us.
      return;
    }
    if (dictation.listening) return;
    if (!dictation.supported) {
      setError('Voice is not supported in this browser. Tap a button instead.');
      setFsm('IDLE');
      return;
    }
    dictation.reset();
    setRecordedUtterance('');
    setFsm('LISTENING_NAV');
    try {
      dictation.start();
    } catch {
      setError('Could not start the microphone. Check your browser permissions.');
      setFsm('IDLE');
    }
  }, [dictation, speech]);

  // Window-level mouseup/touchend so a PTT press that drags off the
  // button still gets released. Without this, the user can press,
  // drag, and never trigger `stop` until they re-enter the button.
  useEffect(() => {
    if (!isOpen) return;
    const stop = (): void => {
      if (dictation.listening) dictation.stop();
    };
    window.addEventListener('mouseup', stop);
    window.addEventListener('touchend', stop);
    return () => {
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('touchend', stop);
    };
  }, [isOpen, dictation]);

  // 30-s silence cap. The mic is not always actively spoken into, and
  // if the user walks away with PTT still pressed we don't want a
  // hot mic for the next half hour.
  useEffect(() => {
    if (!dictation.listening) return;
    const cap = window.setTimeout(() => {
      if (dictation.listening) dictation.stop();
      setError('Stopped listening after 30 seconds of silence.');
      setFsm('IDLE');
    }, 30_000);
    return () => window.clearTimeout(cap);
  }, [dictation.listening, dictation]);

  // On open: speak the current step, then transition into listening
  // when TTS ends.
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setFsm('OPENING');
    if (!currentStep) {
      // Nothing to speak — go straight to nav listening.
      startMic();
      return;
    }
    speech.cancel();
    speech.speak(`Step ${currentStep.stepNumber}. ${currentStep.spokenText}`, {
      rate: 0.92,
    });
    // Falls through to the speech.speaking watcher effect below.
  }, [isOpen, currentStep, speech, startMic]);

  // Watcher: when TTS finishes speaking, transition INTO LISTENING.
  // We key on the FSM state, `speech.speaking`, and `speech.supported`
  // — the watcher is the only place that resolves the "TTS end"
  // signal without a callback API on `useSpeechSynthesis`.
  useEffect(() => {
    if (fsm !== 'OPENING' && fsm !== 'READING_REPLY') return;
    if (speech.supported && speech.speaking) return;
    startMic();
  }, [fsm, speech.speaking, speech.supported, startMic]);

  // Watch the live interim transcript so the cook sees their words
  // immediately. Cosmetic — only `finalTranscript` actually fires
  // routing.
  useEffect(() => {
    if (fsm !== 'LISTENING_NAV' && fsm !== 'LISTENING_QUESTION') return;
    setRecordedUtterance(dictation.transcript || dictation.finalTranscript);
  }, [dictation.transcript, dictation.finalTranscript, fsm]);

  // Watch finalTranscript and route it.
  useEffect(() => {
    if (fsm !== 'LISTENING_NAV' && fsm !== 'LISTENING_QUESTION') return;
    const utt = dictation.finalTranscript.trim();
    if (!utt) return;
    if (processingRef.current) return;
    processingRef.current = true;
    dictation.stop();
    handleUtterance(utt).finally(() => {
      processingRef.current = false;
    });
  // handleUtterance is declared below; keyed here on its identity via
  // the ref-closure pattern (latest-write-wins).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dictation.finalTranscript, fsm, dictation]);

  // Surface SR errors back to the user once. Re-surfacing every error
  // event would be noisy (kitchens have lots of false-starts).
  useEffect(() => {
    if (!dictation.error) return;
    if (dictation.error.includes('not-allowed') || dictation.error.includes('Microphone')) {
      toast.push({
        kind: 'error',
        title: 'Microphone blocked',
        description: 'Allow microphone access in your browser settings. You can still tap the buttons below.',
      });
      setError(dictation.error);
      setFsm('IDLE');
    }
  }, [dictation.error, toast]);

  // ──────────────────────────────────────────────────────────────────
  //  Utterance routing
  // ──────────────────────────────────────────────────────────────────

  const handleUtterance = useCallback(
    async (raw: string): Promise<void> => {
      // Surface what the cook said immediately (already done by the
      // interim-watcher effect).
      setRecordedUtterance(raw);

      // 1. Question-shape check FIRST. An utterance like "how do I know
      //    when the chicken is done" contains the substring "done" and
      //    would otherwise false-match the nav grammar. Routing questions
      //    to the LLM is the correct user intent.
      if (looksLikeQuestion(raw)) {
        // No grammar match — straight to the LLM path below.
      } else {
        // 2. Grammar-first: nav intents only on non-question utterances.
        const intent = classifyUtterance(raw);
        if (intent) {
          if (intent === 'nav:stop-listening') {
            speech.speak('Closing voice mode.', { rate: 0.95 });
            onClose();
            return;
          }
          onNav(intent);
          const ack = navAck(intent);
          speech.speak(ack, { rate: 0.95 });
          setFsm('OPENING'); // Wait for TTS end, then startMic.
          return;
        }
        // 3. Neither question-shape nor a nav command — noise fallback.
        setFsm('READING_REPLY');
        speech.speak(
          "Sorry, I didn't catch a question. Try asking about a substitute or how something should look.",
          { rate: 0.95 },
        );
        return;
      }

      // 3. Cache lookup. The server-side LRU keys on
      // `normalizeQuestion(q) + '|' + phase` (deliberately without
      // recipeName — the same chicken-doneness answer is right for
      // every recipe, so joining the title only wastes slots).
      const cacheKey =
        normalizeQuestion(raw) + '|' + (currentStep?.phase ?? 'any');
      const cached = cacheRef.current.get(cacheKey);
      if (cached) {
        setLastReply({ ...cached, source: 'cache', question: raw });
        setFsm('READING_REPLY');
        speech.speak(cached.answer, { rate: 0.95 });
        return;
      }

      // 4. LLM roundtrip.
      setFsm('THINKING');
      try {
        const reply = await agentClient.askChef({
          sessionId,
          question: raw,
          recipeName,
          currentStepText: currentStep?.text,
          currentStepPhase: currentStep?.phase,
          currentStepNumber: currentStep?.stepNumber,
          cacheKey,
        });
        cacheRef.current.set(cacheKey, { answer: reply.answer, followUp: reply.followUp });
        setLastReply({ ...reply, question: raw });
        setFsm('READING_REPLY');
        speech.speak(reply.answer, { rate: 0.95 });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not reach the cooking agent.';
        setError(msg);
        toast.push({
          kind: 'error',
          title: 'Could not get an answer',
          description: msg,
        });
        setFsm('OPENING'); // re-prompt via startMic.
      }
    },
    [currentStep, onClose, onNav, recipeName, sessionId, speech, toast],
  );

  if (!isOpen) return null;

  // ──────────────────────────────────────────────────────────────────
  //  Render
  // ──────────────────────────────────────────────────────────────────

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Voice mode for cooking"
      className="fixed inset-0 z-50 flex flex-col bg-pepper-900/95 text-flour-50"
      data-testid="cook-voice-overlay"
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 p-4">
        <header className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wider text-flour-50/70">
              <Volume2 size={12} className="mr-1 inline" /> Voice mode
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">{recipeName}</h2>
            {currentStep && (
              <p className="mt-1 text-sm text-flour-50/80">
                Step {currentStep.stepNumber} · {currentStep.phase}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Close voice mode"
            onClick={onClose}
            className="rounded-full p-2 hover:bg-flour-50/10"
          >
            <X size={18} />
          </button>
        </header>

        <section className="rounded-2xl border border-flour-50/20 bg-pepper-700/60 p-3">
          {currentStep ? (
            <p className="text-2xl font-medium leading-snug">{currentStep.text}</p>
          ) : (
            <p className="text-flour-50/70">No step is selected.</p>
          )}
        </section>

        {/* Listening / thinking indicator */}
        <section
          aria-live="polite"
          className="flex flex-1 flex-col gap-2 overflow-hidden rounded-2xl border border-flour-50/15 bg-pepper-800/50 p-3"
        >
          <FsmBadge state={fsm} speechSupported={speech.supported} dictationSupported={dictation.supported} />

          <div className="min-h-[3rem] rounded-lg bg-pepper-900/40 p-3" data-testid="transcript-panel">
            {recordedUtterance ? (
              <p className="text-base italic text-flour-50/90">{recordedUtterance}</p>
            ) : dictation.transcript ? (
              <p className="text-base text-flour-50/70 italic">{dictation.transcript}</p>
            ) : (
              <p className="text-sm text-flour-50/50">
                Tap the mic, then say a step command or ask a question.
              </p>
            )}
          </div>

          {lastReply && (
            <div
              className="rounded-lg border border-basil-300/30 bg-basil-700/40 p-3"
              data-testid="recipe-reply-card"
            >
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-basil-200" />
                <p className="text-xs uppercase tracking-wider text-basil-200">
                  {lastReply.source === 'cache' ? 'Cached answer' : 'From the chef'}
                </p>
              </div>
              <p className="mt-2 text-base leading-snug">{lastReply.answer}</p>
              {lastReply.followUp && (
                <p className="mt-2 text-xs text-flour-50/60">{lastReply.followUp}</p>
              )}
            </div>
          )}
        </section>

        {error && (
          <p className="rounded-lg bg-tomato-700/40 px-3 py-2 text-xs text-tomato-100">{error}</p>
        )}

        {/* Mic button: hold to record */}
        <section className="no-print fixed inset-x-0 bottom-0 flex items-center justify-center gap-3 border-t border-flour-50/20 bg-pepper-900/80 p-4 backdrop-blur">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Repeat current step"
            onClick={() => {
              if (!currentStep) return;
              speech.cancel();
              if (speech.speaking) return;
              speech.speak(`Step ${currentStep.stepNumber}. ${currentStep.spokenText}`, { rate: 0.92 });
            }}
            leftIcon={<RefreshCcw size={14} aria-hidden="true" />}
            className="bg-flour-50/10 text-flour-50 hover:bg-flour-50/20"
          >
            Repeat
          </Button>
          <button
            type="button"
            aria-label="Press to talk"
            aria-pressed={dictation.listening}
            disabled={fsm === 'THINKING' || speech.speaking}
            onMouseDown={() => {
              if (fsm === 'THINKING' || speech.speaking) return;
              processingRef.current = false;
              if (dictation.listening) return;
              dictation.start();
              setFsm('LISTENING_NAV');
            }}
            onMouseUp={() => {
              if (dictation.listening) dictation.stop();
            }}
            onMouseLeave={() => {
              if (dictation.listening) dictation.stop();
            }}
            onTouchStart={(e) => {
              if (fsm === 'THINKING' || speech.speaking) return;
              e.preventDefault();
              processingRef.current = false;
              if (dictation.listening) return;
              dictation.start();
              setFsm('LISTENING_NAV');
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              if (dictation.listening) dictation.stop();
            }}
            className={[
              'flex h-20 w-20 items-center justify-center rounded-full text-flour-50 shadow-warm transition-all',
              dictation.listening
                ? 'scale-110 bg-tomato-500 ring-4 ring-tomato-300/40 listening-pulse'
                : 'bg-tomato-700 hover:bg-tomato-600',
            ].join(' ')}
            data-listening={dictation.listening ? 'true' : 'false'}
          >
            {dictation.listening ? <MicOff size={28} /> : <Mic size={28} />}
          </button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Close voice mode"
            onClick={onClose}
            leftIcon={<X size={14} aria-hidden="true" />}
            className="bg-flour-50/10 text-flour-50 hover:bg-flour-50/20"
          >
            End
          </Button>
        </section>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------
//  Small sub-component: renders the current FSM state as a tiny chip.
//  Kept out of the main render so the dialog tree stays flat for RN-style
//  review audits.
// ---------------------------------------------------------------------

const FsmBadge = ({
  state,
  speechSupported,
  dictationSupported,
}: {
  state: FsmState;
  speechSupported: boolean;
  dictationSupported: boolean;
}): ReactNode => {
  if (!speechSupported || !dictationSupported) {
    return (
      <p className="rounded-full bg-flour-50/10 px-3 py-1 text-xs text-flour-50/70">
        Voice not supported in this browser. Use the buttons on the recipe page.
      </p>
    );
  }
  const label = (() => {
    switch (state) {
      case 'IDLE':
        return 'Idle';
      case 'OPENING':
        return 'Reading the step…';
      case 'LISTENING_NAV':
        return 'Listening — say a command or a question.';
      case 'LISTENING_QUESTION':
        return 'Listening for your question.';
      case 'THINKING':
        return 'Thinking…';
      case 'READING_REPLY':
        return 'Reading the answer…';
    }
  })();
  const isLive = state === 'LISTENING_NAV' || state === 'LISTENING_QUESTION';
  return (
    <p
      className={[
        'inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs',
        isLive ? 'bg-tomato-500/30 text-flour-50' : 'bg-flour-50/10 text-flour-50/70',
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        className={[
          'h-2 w-2 rounded-full',
          isLive ? 'bg-tomato-300 animate-pulse' : 'bg-flour-50/40',
        ].join(' ')}
      />
      {label}
    </p>
  );
};

const navAck = (intent: OverlayIntent): string => {
  switch (intent) {
    case 'nav:next':
      return 'Next step.';
    case 'nav:back':
      return 'Back one step.';
    case 'nav:done':
      return 'Got it. Marking done.';
    case 'nav:repeat':
      return 'Sure. I will repeat.';
    case 'nav:start-timer':
      return 'Starting the step timer.';
    case 'nav:cancel-timer':
      return 'Stopping the timer.';
    case 'nav:stop-listening':
      return 'Closing voice mode.';
  }
};

export default CookVoiceOverlay;
