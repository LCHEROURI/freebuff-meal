/**
 * Tiny LRU cache for the CookVoiceOverlay's ask-the-chef loop.
 *
 * Why: per-session coaching sessions are short (~30 minutes) but the
 * cook will re-ask the same "how do I know the chicken is done?"
 * question 2-3 times. Without a cache, every rephrase fires a Cloud
 * Function cold-start + Gemini roundtrip + TTS playback. With this
 * cache we serve the previous answer in <30 ms.
 *
 * Bounded:
 *   - `maxEntries` (default 20) — collections overflow the oldest.
 *   - `ttlMs` (default 30 min) — even on dishes that span many steps,
 *     a 30-min TTL keeps the cook from getting stale safety advice.
 *
 * Pure JS Map preserves insertion order, so "shift the oldest entry
 * out" is just `keys().next().value`. No extra dependencies.
 */

export type LruEntry<V> = {
  value: V;
  insertedAt: number;
};

export type LruCacheOptions = {
  maxEntries?: number;
  ttlMs?: number;
};

export class AnswerLru<V> {
  private readonly store = new Map<string, LruEntry<V>>();

  private readonly maxEntries: number;

  private readonly ttlMs: number;

  constructor(opts: LruCacheOptions = {}) {
    this.maxEntries = Math.max(1, opts.maxEntries ?? 20);
    this.ttlMs = Math.max(1_000, opts.ttlMs ?? 30 * 60 * 1000);
  }

  /** Returns the cached value or null. Expired entries are treated as
   *  misses AND evicted lazily (the eviction is a side effect that
   *  keeps the next lookup simple). */
  get(key: string): V | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.insertedAt > this.ttlMs) {
      this.store.delete(key);
      return null;
    }
    // Touch on read: moves the entry to the tail of the Map's insertion
    // order, so the LRU eviction in `set()` is correct.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  /** Insert or refresh. Evicts the oldest entry when at capacity. */
  set(key: string, value: V): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      // Maps preserve insertion order; the first key is the oldest.
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, insertedAt: Date.now() });
  }

  /** True iff a non-expired entry exists for `key`. */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /** Drop everything (used when the cook finishes the session). */
  clear(): void {
    this.store.clear();
  }

  /** Read-only diagnostic surface (tests, debug chips). */
  get size(): number {
    return this.store.size;
  }
}
