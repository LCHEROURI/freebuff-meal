import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Mic, MicOff, Command } from 'lucide-react';

import { useToast } from '@/components/common/Toast';

/**
 * Browser-native voice-command listener for Cook Mode.
 *
 * Sibling of `VoiceInputButton`. Where VoiceInputButton writes dictated text
 * into a host <input>/<textarea> (text dictation), this component fires
 * application-level INTENTS in response to short utterances from a fixed
 * grammar. The two live separately: if you want dictation and commands on
 * the same page, mount both — their Web Speech APIs run independently.
 *
 * Grammar (matched case-insensitively, `includes`-style substring against the
 * final transcript):
 *
 *   | Intent           | Phrases                                            |
 *   | ---------------- | -------------------------------------------------- |
 *   | `next`           | "next step", "next", "forward", "continue"         |
 *   | `back`           | "back", "previous step", "previous", "go back"     |
 *   | `done`           | "done", "finished", "complete", "mark done"        |
 *   | `repeat`         | "repeat", "again", "say again", "read again"       |
 *   | `start-timer`    | "start timer", "begin timer", "set timer"          |
 *   | `cancel-timer`   | "stop timer", "cancel timer", "clear timer"        |
 *   | `stop-listening` | "stop listening", "stop voice", "stop"             |
 *
 * Recognition continuous: after every fired (or ignored) intent, the
 * recognition cycles back to listening for the next command. Toggle the
 * listener off via the button OR via the `stop-listening` intent.
 */

export type CookModeIntent =
  | 'next'
  | 'back'
  | 'done'
  | 'repeat'
  | 'start-timer'
  | 'cancel-timer'
  | 'stop-listening';

export type VoiceCommandListenerProps = {
  onIntent: (intent: CookModeIntent) => void;
  /** Whether the listener is enabled. When `false`, the mic renders inert. */
  enabled: boolean;
  /** Optional className for the rendered button. */
  className?: string;
};

const INTENT_MATCHERS: ReadonlyArray<{ intent: CookModeIntent; phrases: ReadonlyArray<string> }> = [
  { intent: 'next', phrases: ['next step', 'next', 'forward', 'continue'] },
  { intent: 'back', phrases: ['previous step', 'go back', 'back', 'previous'] },
  { intent: 'done', phrases: ['mark done', 'complete', 'finished', 'done'] },
  { intent: 'repeat', phrases: ['read again', 'say again', 'repeat', 'again'] },
  {
    intent: 'start-timer',
    phrases: ['start the timer', 'begin the timer', 'start timer', 'begin timer', 'set timer'],
  },
  {
    intent: 'cancel-timer',
    phrases: ['cancel timer', 'clear timer', 'stop timer'],
  },
  { intent: 'stop-listening', phrases: ['stop listening', 'stop voice', 'quit listening'] },
];

/**
 * Resolve an utterance to the first intent whose phrase appears as a case-
 * insensitive substring of the transcript. Returns `null` for no match
 * (so the caller can keep listening, treating it as a normal "didn't
 * catch that").
 *
 * Sorted by phrase length DESC so "next step" wins over "next".
 */
const resolveIntent = (raw: string): CookModeIntent | null => {
  const text = raw.toLowerCase().trim();
  if (!text) return null;
  const ordered = [...INTENT_MATCHERS].sort((a, b) => {
    const maxB = Math.max(...b.phrases.map((p) => p.length));
    const maxA = Math.max(...a.phrases.map((p) => p.length));
    return maxB - maxA;
  });
  for (const matcher of ordered) {
    if (matcher.phrases.some((p) => text.includes(p))) return matcher.intent;
  }
  return null;
};

const SR = (): typeof window.SpeechRecognition | undefined =>
  typeof window === 'undefined'
    ? undefined
    : window.SpeechRecognition ?? window.webkitSpeechRecognition;

export const VoiceCommandListener = ({
  onIntent,
  enabled,
  className = '',
}: VoiceCommandListenerProps): ReactNode => {
  const toast = useToast();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const [supported, setSupported] = useState<boolean>(true);
  const [listening, setListening] = useState<boolean>(false);

  // Mount-time feature detect.
  useEffect(() => {
    if (!SR()) setSupported(false);
  }, []);

  const stop = useCallback(() => {
    const r = recognitionRef.current;
    if (!r) {
      setListening(false);
      return;
    }
    try {
      r.abort();
    } catch {
      // The recognition object may already be in a closed state; we just
      // need the React state to settle.
    }
    recognitionRef.current = null;
    setListening(false);
  }, []);

  // Stop listening when the cook toggles the feature off.
  useEffect(() => {
    if (!enabled) stop();
  }, [enabled, stop]);

  // Start (or re-start) continuous recognition. Each fired intent cycles
  // the engine so the next command is heard without a re-tap.
  const start = useCallback(() => {
    if (!supported) return;
    const Ctor = SR();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = navigator?.language || 'en-US';
    r.continuous = true;
    r.interimResults = false;
    r.maxAlternatives = 1;

    r.onstart = () => setListening(true);

    r.onresult = (ev) => {
      const last = ev.results[ev.results.length - 1];
      const transcript = last?.[0]?.transcript ?? '';
      const intent = resolveIntent(transcript);
      if (intent) {
        if (intent === 'stop-listening') {
          stop();
          onIntent('stop-listening');
          return;
        }
        onIntent(intent);
      }
      // `no-match` is silent — most kitchen utterances are too noisy to
      // bother the cook with a toast each time.
    };

    r.onerror = (ev) => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        toast.push({
          kind: 'error',
          title: 'Microphone access blocked',
          description:
            'Allow microphone access in your browser settings to use voice commands. You can still tap to navigate.',
        });
      }
      stop();
    };

    r.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };

    recognitionRef.current = r;
    try {
      r.start();
    } catch {
      // InvalidStateError (recognition already started; e.g. strict-mode
      // dev double-mount) and similar are swallowed — at worst, the user
      // can tap the mic again.
      recognitionRef.current = null;
      setListening(false);
    }
  }, [supported, onIntent, stop, toast]);

  // React 18 strict-mode cleanup: every unmount aborts any live session.
  useEffect(() => () => stop(), [stop]);

  const onClick = () => {
    if (listening) {
      stop();
      onIntent('stop-listening');
    } else if (enabled) {
      start();
    }
  };

  if (!supported) return null;

  const label = listening
    ? 'Stop voice commands'
    : enabled
      ? 'Voice commands'
      : 'Voice commands (off)';

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={listening}
      data-listening={listening ? 'true' : 'false'}
      onClick={onClick}
      disabled={!enabled && !listening}
      className={[
        'inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
        listening
          ? 'bg-tomato-100 text-tomato-700 ring-2 ring-tomato-500 listening-pulse'
          : enabled
            ? 'bg-butter-100 text-pepper-700 hover:bg-turmeric-100 hover:text-turmeric-700'
            : 'bg-butter-50 text-pepper-400',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {listening ? <MicOff size={14} aria-hidden="true" /> : <Mic size={14} aria-hidden="true" />}
      <Command size={12} aria-hidden="true" />
      <span>{listening ? 'Listening' : 'Voice'}</span>
    </button>
  );
};

VoiceCommandListener.displayName = 'VoiceCommandListener';
