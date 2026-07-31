/**
 * PR #43 — ambient voice pantry tests.
 *
 * Three categories:
 *  1. `normalizePantryName` — the dedupe-key reducer.
 *  2. Pantry onCall schemas —	client mirror parity with the server.
 *  3. `dedupeKey` identity computation —	frozen vs fresh of the same
 *     ingredient must produce distinct docs.
 */
import { describe, expect, it } from 'vitest';

import {
  PantryItemSchema,
  dedupeKey,
  normalizePantryName,
} from '../functions/src/ai/schemas/pantry.js';

describe('normalizePantryName', () => {
  it('lowercases, strips punctuation, collapses whitespace', () => {
    expect(normalizePantryName('  Chicken!! ')).toBe('chicken');
    expect(normalizePantryName('Frozen Broccoli (organic)')).toBe(
      'frozen broccoli organic',
    );
    expect(normalizePantryName('Garlic &\u00A0Onion')).toBe('garlic onion');
  });

  it('is stable across trivial variants so dedupe matches', () => {
    const a = normalizePantryName('Tomato!');
    const b = normalizePantryName('  tomato? ');
    expect(a).toBe(b);
  });
});

describe('dedupeKey identity', () => {
  it('produces a single key for identical (ownerId, name, condition)', () => {
    const k1 = dedupeKey('u1', 'chicken', 'fresh');
    const k2 = dedupeKey('u1', 'chicken', 'fresh');
    expect(k1).toBe(k2);
  });

  it('separates frozen vs fresh of the same ingredient', () => {
    const fresh = dedupeKey('u1', 'chicken', 'fresh');
    const frozen = dedupeKey('u1', 'chicken', 'frozen');
    expect(fresh).not.toBe(frozen);
  });

  it('separates plain vs leftover of the same ingredient', () => {
    const plain = dedupeKey('u1', 'rice', null);
    const leftover = dedupeKey('u1', 'rice', 'leftover');
    expect(plain).not.toBe(leftover);
  });

  it('separates owners so users do not collide', () => {
    const u1 = dedupeKey('u1', 'rice', null);
    const u2 = dedupeKey('u2', 'rice', null);
    expect(u1).not.toBe(u2);
  });
});

describe('PantryItemSchema', () => {
  it('round-trips a minimal voice entry', () => {
    const parsed = PantryItemSchema.safeParse({
      id: 'pantry_abc',
      ownerId: 'u1',
      name: 'Chicken',
      normalizedName: 'chicken',
      quantity: null,
      unit: null,
      condition: 'fresh',
      source: 'voice',
      confidence: 0.7,
      addedAt: '2024-01-01T00:00:00.000Z',
      lastUsedAt: null,
      timesUsed: 0,
      note: null,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects negative quantities', () => {
    const parsed = PantryItemSchema.safeParse({
      id: 'pantry_abc',
      ownerId: 'u1',
      name: 'Chicken',
      normalizedName: 'chicken',
      quantity: -1,
      unit: null,
      condition: null,
      source: 'voice',
      confidence: 0.7,
      addedAt: '2024-01-01T00:00:00.000Z',
      lastUsedAt: null,
      timesUsed: 0,
      note: null,
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects unknown source', () => {
    const parsed = PantryItemSchema.safeParse({
      id: 'pantry_abc',
      ownerId: 'u1',
      name: 'Chicken',
      normalizedName: 'chicken',
      quantity: null,
      unit: null,
      condition: null,
      source: 'spider',
      confidence: 0.7,
      addedAt: '2024-01-01T00:00:00.000Z',
      lastUsedAt: null,
      timesUsed: 0,
      note: null,
    });
    expect(parsed.success).toBe(false);
  });
});
