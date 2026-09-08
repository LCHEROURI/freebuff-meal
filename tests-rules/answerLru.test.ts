import { describe, expect, it, vi } from 'vitest';

import { AnswerLru } from '../src/features/agent/answerLru';

describe('AnswerLru', () => {
  it('returns null on cache miss', () => {
    const cache = new AnswerLru<number>();
    expect(cache.get('nope')).toBeNull();
    expect(cache.has('nope')).toBe(false);
  });

  it('stores and retrieves a value', () => {
    const cache = new AnswerLru<string>();
    cache.set('q1', 'reply');
    expect(cache.get('q1')).toBe('reply');
    expect(cache.has('q1')).toBe(true);
  });

  it('refreshes insertion order on read (touched entries stay live)', () => {
    const cache = new AnswerLru<string>({ maxEntries: 2 });
    cache.set('a', 'A');
    cache.set('b', 'B');
    // Touch 'a' so it's the newest.
    expect(cache.get('a')).toBe('A');
    // Adding a third key should evict 'b' (now oldest).
    cache.set('c', 'C');
    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('c')).toBe(true);
  });

  it('evicts the oldest entry when at capacity', () => {
    const cache = new AnswerLru<number>({ maxEntries: 3 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.set('d', 4);
    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(true);
    expect(cache.has('c')).toBe(true);
    expect(cache.has('d')).toBe(true);
    expect(cache.size).toBe(3);
  });

  it('evicts expired entries on read', () => {
    vi.useFakeTimers();
    try {
      const cache = new AnswerLru<string>({ ttlMs: 1000 });
      cache.set('q', 'reply');
      vi.advanceTimersByTime(1500);
      expect(cache.get('q')).toBeNull();
      expect(cache.has('q')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clear() drops all entries', () => {
    const cache = new AnswerLru<string>();
    cache.set('a', 'A');
    cache.set('b', 'B');
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.has('a')).toBe(false);
  });

  it('re-inserting the same key replaces the value (refresh on set)', () => {
    const cache = new AnswerLru<string>();
    cache.set('q', 'first');
    cache.set('q', 'second');
    expect(cache.get('q')).toBe('second');
    expect(cache.size).toBe(1);
  });
});
