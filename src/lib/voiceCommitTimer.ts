/**
 * Timebox pattern for continuous voice dictation.
 *
 * The Web Speech API marks a result as `isFinal` whenever the engine
 * is *confident enough* about a fragment — not when the user is done
 * speaking. A natural mid-thought pause (anything > a few hundred
 * milliseconds) is enough for the engine to commit "I have chicken"
 * separately from "tomatoes and garlic", producing two appends where
 * the chef intended one.
 *
 * Strategy: on every result (interim or final), call `arm(text)` with
 * the current best-guess transcript. The timer resets to `silenceMs`
 * each call. After `silenceMs` of silence, `commit` fires and the
 * registered text reaches the host field via `onCommit`.
 *
 * Race conditions handled:
 *   - `commit()` while a timer is pending → fire immediately, cancel
 *     the queued timer.
 *   - `arm()` while a timer is pending → reset text + reset timer to
 *     `silenceMs` (latest text wins).
 *   - `cancel()` from unmount / error-stop → clear the timer, do NOT
 *     fire onCommit (pending text discarded).
 *   - Multiple commits in flight → onCommit fires at most once per
 *     arm() burst.
 *
 * Pluggable `setTimeoutImpl` / `clearTimeoutImpl` so unit tests can
 * substitute vitest's fake timers without monkey-patching globals.
 *
 * Extracted so the lifecycle logic is independently testable rather
 * than buried inside a React component.
 */

export type VoiceCommitTimerOptions = {
  /** How long to wait after the last arm() before firing onCommit. */
  silenceMs: number;
  /** Called once per arm() burst, with the trimmed text. */
  onCommit: (text: string) => void;
  /**
   * Defaults to the global `setTimeout`. Tests substitute vitest's
   * fake-timer implementation by passing `vi.useFakeTimers().setTimeout`
   * here.
   */
  setTimeoutImpl?: typeof setTimeout;
  /** Defaults to the global `clearTimeout`. */
  clearTimeoutImpl?: typeof clearTimeout;
};

export type VoiceCommitTimer = {
  /** Update the tracked text and (re-)arm the silence timer. */
  arm: (text: string) => void;
  /** Commit synchronously; cancels any pending timer. */
  commit: () => void;
  /** Discard pending text; cancels any pending timer. */
  cancel: () => void;
  /** True iff there's a pending timer or tracked text has been armed. */
  readonly pending: boolean;
};

export const CREATE_VOICE_COMMIT_TIMER_DEFAULT_SILENCE_MS = 1500;

export const createVoiceCommitTimer = ({
  silenceMs,
  onCommit,
  setTimeoutImpl,
  clearTimeoutImpl,
}: VoiceCommitTimerOptions): VoiceCommitTimer => {
  const setT = setTimeoutImpl ?? setTimeout;
  const clearT = clearTimeoutImpl ?? clearTimeout;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let text = '';

  const fireIfNonEmpty = (raw: string): void => {
    const trimmed = raw.trim();
    if (trimmed.length > 0) {
      onCommit(trimmed);
    }
  };

  const cancel = (): void => {
    if (timer !== null) {
      clearT(timer);
      timer = null;
    }
    text = '';
  };

  const commit = (): void => {
    if (timer !== null) {
      clearT(timer);
      timer = null;
    }
    const out = text;
    text = '';
    fireIfNonEmpty(out);
  };

  const arm = (next: string): void => {
    text = next;
    if (timer !== null) {
      clearT(timer);
    }
    timer = setT(() => {
      timer = null;
      const out = text;
      text = '';
      fireIfNonEmpty(out);
    }, silenceMs);
  };

  return {
    arm,
    commit,
    cancel,
    get pending(): boolean {
      return timer !== null || text.length > 0;
    },
  };
};
