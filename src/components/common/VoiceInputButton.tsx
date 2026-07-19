import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Mic, MicOff } from 'lucide-react';

import { useToast } from '@/components/common/Toast';

/**
 * Browser-native voice input for any adjacent <input> or <textarea>.
 *
 * Architecture (validated by /thinker-with-files-gemini):
 *
 * 1. **API choice** — `SpeechRecognition` / `webkitSpeechRecognition`. No
 *    external STT service; feature-detect at runtime and silently render
 *    nothing when unsupported (Firefox today, any future dropped support).
 *
 * 2. **Form integration** — DOM traversal + the canonical React-aware
 *    native-input-value setter. The button resolves the host field by
 *    walking up from its own DOM node (`closest('label, [data-voice-host]')`),
 *    then setting the host's `value` via the prototype's `value` setter
 *    and dispatching a real `input` event. React Hook Form's `onChange`
 *    fires exactly as if the user typed — no API change to Input / Textarea
 *    and no `setValue` ceremony at every call site.
 *
 * 3. **Append vs replace** — append with a single space when the host is
 *    a `<textarea>` (so successive transcripts read naturally in the notes
 *    field); replace entirely when the host is an `<input>`. This matches
 *    what the user expects: dictation creates prose; signup fields
 *    re-take a single token like a display name.
 *
 * 4. **Strict-mode safe** — `recognition` is held in a ref so the
 *    `useEffect` cleanup can `abort()` on every unmount, including the
 *    double-mount dev-time cycle. No zombie microphone handle left on
 *    the OS audio stack.
 *
 * 5. **A11y** — `aria-label` toggles between "Voice input" and "Stop voice
 *    input"; `aria-pressed` reflects listening state; the `aria-live="polite"`
 *    live region announces only STATE TRANSITIONS (start, committed final,
 *    error, stop) — never the interim transcript, which would otherwise
 *    echo the user's own partial words 5–10+ times per utterance.
 *
 * 6. **Errors** — `not-allowed` triggers a toast so the user knows why
 *    nothing happened; `no-speech` is silent (speech engine saw nothing
 *    recognisable); `aborted` after explicit stop is also silent.
 */

export type VoiceInputButtonProps = {
  /** Optional override for the BCP-47 language tag. Defaults to the user's locale. */
  lang?: string;
  /** Continuous dictation (default) vs single-shot. */
  continuous?: boolean;
  /**
   * Optional explicit host element override. If omitted, the button uses
   * DOM traversal from its own rendered button element to find the nearest
   * `<input>` or `<textarea>` sibling.
   */
  hostSelector?: string;
  /** Optional className for the rendered button. */
  className?: string;
};

const SR = (): typeof window.SpeechRecognition | undefined =>
  typeof window === 'undefined'
    ? undefined
    : window.SpeechRecognition ?? window.webkitSpeechRecognition;

export const VoiceInputButton = ({
  lang,
  continuous = true,
  hostSelector,
  className = '',
}: VoiceInputButtonProps): ReactNode => {
  const toast = useToast();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  // `recognitionRef.current` holds the live `SpeechRecognition` instance
  // produced by `new SR()(`. Typed as the interface from `web-speech.d.ts`
  // so the strict-mode `useEffect` cleanup can `abort()` it without the
  // `InstanceType<X>` gymnastics that would force `X` to be a class.
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const [supported, setSupported] = useState<boolean>(true);
  const [listening, setListening] = useState<boolean>(false);
  // `srAnnouncement` is the text the screen-reader `aria-live` live region
  // emits. We only push to it on STATE TRANSITIONS (start / committed-final
  // / stop / error) — never on interim updates — so SR users don't hear
  // their own partial transcript announced 5–10 times.
  const [srAnnouncement, setSrAnnouncement] = useState<string>('');

  // Mount-time feature detect. Done in state rather than a render-time
  // guard so SSR / vitest (which has no SpeechRecognition) renders `null`
  // without hydration mismatch.
  useEffect(() => {
    if (!SR()) setSupported(false);
  }, []);

  const findHost = useCallback((): HTMLInputElement | HTMLTextAreaElement | null => {
    const root = buttonRef.current;
    if (!root) return null;
    if (hostSelector) {
      const explicit = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(hostSelector);
      return explicit;
    }
    // Walk to the closest form-field wrapper. `Input` / `Textarea` both
    // render a `<label>` ancestor, and `[data-voice-host]` is the explicit
    // opt-in attribute for any future custom host.
    const wrapper = root.closest('label, [data-voice-host]');
    if (!wrapper) return null;
    return wrapper.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
  }, [hostSelector]);

  const setHostValue = useCallback((value: string) => {
    const host = findHost();
    if (!host) return;
    const isTextarea = host.tagName.toLowerCase() === 'textarea';
    const newValue = isTextarea
      ? (host.value ? `${host.value} ${value}` : value).trim()
      : value;
    const proto = isTextarea ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter?.call(host, newValue);
    host.dispatchEvent(new Event('input', { bubbles: true }));
  }, [findHost]);

  // Track the latest listening state in a ref so the `onend` callback
  // (registered at `start()` time, before `listening` flips back) can
  // decide whether an explicit stop actually happened, vs. the engine
  // closing itself out on no-speech / permission-denied.
  const listeningRef = useRef(false);

  const stop = useCallback(() => {
    const r = recognitionRef.current;
    if (!r) {
      setListening(false);
      listeningRef.current = false;
      return;
    }
    try {
      r.abort();
    } catch {
      // The recognition object may already have transitioned into a closed
      // state — that's fine; we just need the React state to settle.
    }
    recognitionRef.current = null;
    setListening(false);
    listeningRef.current = false;
  }, []);

  // Mirror `listening` to the ref so `onend` closures observe current state.
  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);

  const start = useCallback(() => {
    if (!supported) return;
    const Ctor = SR();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = lang ?? (navigator?.language || 'en-US');
    r.continuous = continuous;
    r.interimResults = true;
    r.maxAlternatives = 1;

    r.onstart = () => {
      setListening(true);
      setSrAnnouncement('Voice input active. Speak now.');
    };

    r.onresult = (ev) => {
      let finalText = '';
      for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
        const result = ev.results[i];
        const alt = result[0]?.transcript ?? '';
        if (result.isFinal) finalText += alt;
      }
      if (finalText.trim()) {
        setHostValue(finalText.trim());
        // Announce ONLY when a real utterance commits. The final text
        // also lands in the input itself, where the SR will read it via
        // the standard input-value-change behavior — this announcement
        // is the explicit user-feedback gesture.
        setSrAnnouncement(`Voice input inserted ${finalText.trim().length} characters.`);
      }
    };

    r.onerror = (ev) => {
      // 'no-speech' and 'aborted' are normal user states — silent.
      // 'not-allowed' (mic permission denied) is the one to surface.
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        toast.push({
          kind: 'error',
          title: 'Microphone access blocked',
          description:
            'Allow microphone access in your browser settings to use voice input. You can still type.',
        });
        setSrAnnouncement('Microphone access blocked. You can still type.');
      }
      // Other errors (no-speech / aborted / audio-capture) don't push to
      // srAnnouncement — the listening-state toggle already conveys
      // start/stop faithfully via the visible mic icon.
      stop();
    };

    r.onend = () => {
      // Only announce "stopped" if we transitioned to listening and back,
      // not for the no-op case (e.g. mic denied before any onstart).
      if (listeningRef.current) {
        setSrAnnouncement('Voice input stopped.');
      }
      recognitionRef.current = null;
      setListening(false);
    };

    recognitionRef.current = r;
    try {
      r.start();
    } catch (err) {
      // Some browsers throw `InvalidStateError` if a recognition call is
      // still in-flight; surface only the unexpected ones.
      toast.push({
        kind: 'error',
        title: 'Could not start voice input',
        description: err instanceof Error ? err.message : 'Please try again.',
      });
      recognitionRef.current = null;
      setListening(false);
    }
  }, [supported, lang, continuous, setHostValue, stop, toast]);

  // React 18 strict-mode: effects run twice in dev. The cleanup ensures
  // we never leave a live `recognition` after unmount.
  useEffect(() => () => stop(), [stop]);

  const onClick = () => {
    if (listening) stop();
    else start();
  };

  if (!supported) return null;

  const label = listening ? 'Stop voice input' : 'Voice input';

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={listening}
      data-listening={listening ? 'true' : 'false'}
      onClick={onClick}
      className={[
        'inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors',
        listening
          ? 'bg-tomato-100 text-tomato-600 ring-2 ring-tomato-500 listening-pulse'
          : 'text-pepper-500 hover:bg-butter-100 hover:text-tomato-600',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {listening ? <MicOff size={14} aria-hidden="true" /> : <Mic size={14} aria-hidden="true" />}
      <span className="sr-only" aria-live="polite">
        {srAnnouncement}
      </span>
    </button>
  );
};

VoiceInputButton.displayName = 'VoiceInputButton';
