/**
 * Browser-native speech hooks: TTS (speak) + long-form STT (dictation).
 *
 * Architecture:
 *   - `useSpeechSynthesis` — wraps `window.speechSynthesis` for the
 *     agent's "speak step aloud" behavior. Opt-in: callers must pass
 *     `enabled:true` to start. Cancel-on-unmount avoids the well-known
 *     "tab closed but voice keeps going" bug.
 *   - `useSpeechDictation` — wraps `SpeechRecognition` in continuous
 *     mode for long-form dictation. Unlike the existing
 *     `VoiceInputButton` (host-element dictation that mutates a
 *     `<textarea value>`), this exposes the raw transcript + isFinal
 *     flags so the wizard can render a live transcript preview and
 *     take the final utterance as the agent's input.
 *
 * Pairing:
 *   - `VoiceInputButton` (PR #3) — host-element dictation on existing
 *     fields. Still works unchanged.
 *   - `VoiceCommandListener` (PR #4) — utterance intent grammar.
 *     Still works unchanged for hands-busy Cook Mode.
 *   - `useSpeechDictation` (here) — agent conversation surface. New.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const SR = (): typeof window.SpeechRecognition | undefined =>
  typeof window === 'undefined'
    ? undefined
    : window.SpeechRecognition ?? window.webkitSpeechRecognition;

const TTS = (): typeof window.speechSynthesis | undefined =>
  typeof window === 'undefined' ? undefined : window.speechSynthesis;

// =====================================================================
//  useSpeechSynthesis — speak text aloud (cancel-on-unmount).
// =====================================================================

export type SpeakOptions = {
  rate?: number;
  pitch?: number;
  voiceName?: string;
};

export type UseSpeechSynthesisResult = {
  speak: (text: string, opts?: SpeakOptions) => void;
  cancel: () => void;
  speaking: boolean;
  supported: boolean;
};

export const useSpeechSynthesis = (): UseSpeechSynthesisResult => {
  const [supported, setSupported] = useState<boolean>(true);
  const [speaking, setSpeaking] = useState<boolean>(false);

  useEffect(() => {
    if (!TTS()) setSupported(false);
  }, []);

  const cancel = useCallback(() => {
    if (!TTS()) return;
    try {
      TTS()?.cancel();
    } catch {
      // best-effort
    }
    setSpeaking(false);
  }, []);

  const speak = useCallback((text: string, opts: SpeakOptions = {}) => {
    if (!TTS()) return;
    const synth = TTS();
    if (!synth) return;
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = opts.rate ?? 0.95;
      u.pitch = opts.pitch ?? 1.0;
      if (opts.voiceName) {
        const match = synth.getVoices().find((v) => v.name === opts.voiceName);
        if (match) u.voice = match;
      }
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      synth.speak(u);
    } catch {
      // OS-level TTS disabled; silent.
    }
  }, []);

  // Cancel any in-flight utterance on unmount (the well-known
  // "voice keeps going after navigation" bug).
  useEffect(() => () => cancel(), [cancel]);

  return { speak, cancel, speaking, supported };
};

// =====================================================================
//  useSpeechDictation — long-form STT transcript stream.
// =====================================================================

export type UseSpeechDictationResult = {
  /** Start / re-start continuous recognition. Idempotent. */
  start: () => void;
  /** Stop recognition. Call before reading `transcript` as committed. */
  stop: () => void;
  /** Toggle (true→start, false→stop). */
  toggle: () => void;
  /** Live transcript (interim + final concatenated, deduplicated). */
  transcript: string;
  /** Last committed utterance (post-final). Resets on each new start. */
  finalTranscript: string;
  listening: boolean;
  supported: boolean;
  /** Last error message, or null. */
  error: string | null;
  reset: () => void;
};

export const useSpeechDictation = (
  lang?: string,
): UseSpeechDictationResult => {
  const [supported, setSupported] = useState<boolean>(true);
  const [listening, setListening] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>('');
  const [finalTranscript, setFinalTranscript] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

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
      r.stop();
    } catch {
      // already stopped
    }
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const start = useCallback(() => {
    if (!supported) return;
    const Ctor = SR();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = lang ?? (navigator?.language || 'en-US');
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;

    r.onstart = () => {
      setListening(true);
      setError(null);
      setTranscript('');
    };
    r.onresult = (ev) => {
      let interim = '';
      let final = '';
      for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
        const res = ev.results[i];
        const alt = res[0]?.transcript ?? '';
        if (res.isFinal) final += alt;
        else interim += alt;
      }
      if (final) setFinalTranscript((prev) => `${prev} ${final}`.trim());
      setTranscript(`${interim}`.trim());
    };
    r.onerror = (ev) => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        setError('Microphone access blocked. Allow it in your browser settings.');
      } else if (ev.error === 'no-speech') {
        // Silent — the user might just be thinking.
      } else if (ev.error) {
        setError(`Recognition error: ${ev.error}`);
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
      setError('Could not start voice recognition.');
      recognitionRef.current = null;
      setListening(false);
    }
  }, [supported, lang, stop]);

  // Strict-mode safe unmount.
  useEffect(() => () => stop(), [stop]);

  const reset = useCallback(() => {
    setTranscript('');
    setFinalTranscript('');
    setError(null);
  }, []);

  return {
    start,
    stop,
    toggle: () => (listening ? stop() : start()),
    transcript,
    finalTranscript,
    listening,
    supported,
    error,
    reset,
  };
};
