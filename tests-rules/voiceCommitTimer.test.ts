import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createVoiceCommitTimer } from '@/lib/voiceCommitTimer';

describe('createVoiceCommitTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('commits the trimmed text after silenceMs of silence', () => {
    const onCommit = vi.fn();
    const t = createVoiceCommitTimer({
      silenceMs: 1500,
      onCommit,
      setTimeoutImpl: setTimeout,
      clearTimeoutImpl: clearTimeout,
    });
    t.arm('I have chicken');
    expect(onCommit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1499);
    expect(onCommit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('I have chicken');
  });

  it('resets the timer when armed again before silenceMs elapses', () => {
    const onCommit = vi.fn();
    const t = createVoiceCommitTimer({ silenceMs: 1500, onCommit });
    t.arm('I have');
    vi.advanceTimersByTime(1000);
    t.arm('I have chicken');
    // 1400ms after the re-arm — still inside the new silence window.
    vi.advanceTimersByTime(1400);
    expect(onCommit).not.toHaveBeenCalled();
    // 100ms more — total 1500 since the re-arm.
    vi.advanceTimersByTime(100);
    expect(onCommit).toHaveBeenCalledWith('I have chicken');
  });

  it('latest text wins when armed repeatedly', () => {
    const onCommit = vi.fn();
    const t = createVoiceCommitTimer({ silenceMs: 1500, onCommit });
    t.arm('I have chicken');
    t.arm('I have chicken and');
    t.arm('I have chicken and tomatoes');
    vi.advanceTimersByTime(1500);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('I have chicken and tomatoes');
  });

  it('commit() fires synchronously and clears the pending timer', () => {
    const onCommit = vi.fn();
    const t = createVoiceCommitTimer({ silenceMs: 1500, onCommit });
    t.arm('I have chicken');
    t.commit();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('I have chicken');
    // Even after long elapsed time, the previously-armed timer must
    // not double-fire after an explicit commit.
    vi.advanceTimersByTime(5000);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('cancel() discards pending text without firing onCommit', () => {
    const onCommit = vi.fn();
    const t = createVoiceCommitTimer({ silenceMs: 1500, onCommit });
    t.arm('I have chicken');
    t.cancel();
    vi.advanceTimersByTime(5000);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('commit() with no pending text is a no-op', () => {
    const onCommit = vi.fn();
    const t = createVoiceCommitTimer({ silenceMs: 1500, onCommit });
    t.commit();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('does not fire onCommit for whitespace-only text', () => {
    const onCommit = vi.fn();
    const t = createVoiceCommitTimer({ silenceMs: 1500, onCommit });
    t.arm('   ');
    vi.advanceTimersByTime(1500);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('pending reflects the timer + tracked-text state', () => {
    const onCommit = vi.fn();
    const t = createVoiceCommitTimer({ silenceMs: 1500, onCommit });
    expect(t.pending).toBe(false);
    t.arm('hello');
    expect(t.pending).toBe(true);
    vi.advanceTimersByTime(1500);
    expect(t.pending).toBe(false);
  });

  it('re-arm after a previous timer fires re-arms cleanly', () => {
    const onCommit = vi.fn();
    const t = createVoiceCommitTimer({ silenceMs: 1500, onCommit });
    t.arm('first');
    vi.advanceTimersByTime(1500);
    expect(onCommit).toHaveBeenCalledWith('first');
    const callsAfterFirst = onCommit.mock.calls.length;
    t.arm('second');
    vi.advanceTimersByTime(1500);
    expect(onCommit.mock.calls.length).toBe(callsAfterFirst + 1);
    expect(onCommit).toHaveBeenLastCalledWith('second');
  });
});
