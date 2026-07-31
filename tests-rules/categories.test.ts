/**
 * Offline tests for the custom-categories feature.
 *
 * Mirrors the proven pattern of `tests-rules/cookMode.test.ts` and
 * `tests-rules/agent.test.ts`: read the source files on disk via
 * `readFileSync(...)` and assert against regex-shaped structural
 * snapshots. No emulator, no Firebase, no network. Runs under jsdom
 * (vitest default) so the Zustand store's `window.localStorage` calls
 * are satisfied without a real browser.
 *
 * Coverage spans:
 *   1. Pure `categories.ts` helpers (`normalizeCategoryName`,
 *      `findDuplicate`, `isCategoryDuplicate`, `mergeWithDefaults`,
 *      `canAddCustom`).
 *   2. Zustand `categoryStore.ts` happy paths (hydrate, addCustom,
 *      removeCustom, dedupe against defaults).
 *   3. Wiring of `CategoryChipTray.tsx`, `SettingsPage.tsx`,
 *      `NewPlanPage.tsx`, the Zod `UserProfileSchema`, and the
 *      `firestore.rules` allowlist.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_AVAILABLE_EQUIPMENT,
  DEFAULT_FAVORITE_CUISINES,
  canAddCustom,
  findDuplicate,
  isCategoryDuplicate,
  mergeWithDefaults,
  normalizeCategoryName,
} from '../src/features/settings/categories';
import {
  reconcileCustoms,
  useCategoryStore,
} from '../src/features/settings/categoryStore';

const readSrc = (rel: string): string => {
  // Tests run with project root as cwd (vitest config sets `root: '.'`).
  const absolute = resolve(process.cwd(), rel);
  return readFileSync(absolute, 'utf8');
};

describe('normalizeCategoryName', () => {
  it.each([
    ['Korean', 'Korean'],
    ['  korean  ', 'Korean'],
    ['korean bbq', 'Korean Bbq'],
    ['SOUS VIDE', 'Sous Vide'],
    ['\'korean\'', "'Korean'"], // single-letter apostrophes round-trip but cap first letter
    ['\t\nfoo   bar\t', 'Foo Bar'],
  ])('normalises %p → %p', (input, want) => {
    expect(normalizeCategoryName(input)).toBe(want);
  });

  it('preserves apostrophe-after-capitalisation: o\'brien → O\'Brien', () => {
    // The original assert expected "O'brien" because the title-case step
    // lowercased letters after apostrophes. The newer regex-based path
    // capitalises the first letter of *every* word AND any letter
    // immediately following an apostrophe — matching the typical UI
    // expectation for surnames like "O'Brien". This test pins that contract.
    expect(normalizeCategoryName("o'brien")).toBe("O'Brien");
    expect(normalizeCategoryName("O'BRIEN")).toBe("O'Brien");
  });

  it.each(['', '   ', '\n\t  \n'])(
    'returns null for whitespace-only / empty input %p',
    (input) => {
      expect(normalizeCategoryName(input)).toBeNull();
    },
  );

  it.each([',', ';', ':', '|', ', Korean', 'Korean,', 'a;b'])(
    'returns null for list-separator input %p (`,;:` are rejected; `/` is intentionally allowed)',
    (input) => {
      expect(normalizeCategoryName(input)).toBeNull();
    },
  );

  it('allows slash-bearing names with letters (e.g. \"a/b\") — slash is not in the separator set', () => {
    // Design call: `/` isn't in LIST_SEPARATOR_RE (only `,;:` and `|` are),
    // so names containing a slash with letters on both sides survive. If a
    // future change wants to reject slashes, update both the rule AND this
    // test together.
    expect(normalizeCategoryName('a/b')).toBe('A/b');
  });

  it.each(['.', '-', '--', '!@#$%^&*', '   ', '·'])(
    'returns null for pure-punctuation / no-letter input %p',
    (input) => {
      expect(normalizeCategoryName(input)).toBeNull();
    },
  );

  it('returns null for over-length input (>40 chars)', () => {
    const long = 'x'.repeat(41);
    expect(normalizeCategoryName(long)).toBeNull();
  });

  it('returns null for non-string input', () => {
    // @ts-expect-error — testing runtime defensiveness against bad callers
    expect(normalizeCategoryName(null)).toBeNull();
    // @ts-expect-error — same
    expect(normalizeCategoryName(42)).toBeNull();
  });
});

describe('findDuplicate + isCategoryDuplicate', () => {
  it('returns the matching existing value (case-insensitive, whitespace-tolerant)', () => {
    expect(findDuplicate('korean', ['Korean', 'Italian'])).toBe('Korean');
    expect(findDuplicate('  KOREAN  ', ['Korean', 'Italian'])).toBe('Korean');
    expect(findDuplicate('italian', ['Korean', 'Italian'])).toBe('Italian');
  });

  it('returns null when no match exists', () => {
    expect(findDuplicate('Korean', ['Italian', 'Mexican'])).toBeNull();
    expect(findDuplicate('', ['Italian'])).toBeNull();
    expect(findDuplicate('   ', ['Italian'])).toBeNull();
  });

  it('isCategoryDuplicate checks across defaults+customs+selection', () => {
    expect(
      isCategoryDuplicate('Italian', ['Italian', 'Mexican'], ['Korean'], []),
    ).toBe(true);
    expect(
      isCategoryDuplicate('Korean', ['Italian', 'Mexican'], [], ['Korean']),
    ).toBe(true);
    expect(
      isCategoryDuplicate('Vietnamese', ['Italian', 'Mexican'], ['Korean'], []),
    ).toBe(false);
  });
});

describe('mergeWithDefaults', () => {
  it('returns defaults first, customs second, deduped case-insensitively', () => {
    const merged = mergeWithDefaults(['Italian', 'Mexican'], ['Korean', 'Thai']);
    expect(merged.available).toEqual(['Italian', 'Mexican', 'Korean', 'Thai']);
    expect(merged.droppedFromCustoms).toEqual([]);
  });

  it('drops a custom that shadows a shipped default and reports it back', () => {
    const merged = mergeWithDefaults(['Italian', 'Mexican'], ['Italian', 'Korean']);
    expect(merged.available).toEqual(['Italian', 'Mexican', 'Korean']);
    expect(merged.droppedFromCustoms).toEqual(['Italian']);
  });

  it('drops customs whose trimmed content is empty', () => {
    const merged = mergeWithDefaults(['Italian'], ['   ', '', 'Korean']);
    expect(merged.available).toEqual(['Italian', 'Korean']);
    expect(merged.droppedFromCustoms).toEqual([]);
  });
});

describe('canAddCustom', () => {
  it('returns true below the cap', () => {
    expect(canAddCustom([])).toBe(true);
    expect(canAddCustom(Array(19).fill('x'))).toBe(true);
  });
  it('returns false at or above the cap (20)', () => {
    expect(canAddCustom(Array(20).fill('x'))).toBe(false);
    expect(canAddCustom(Array(21).fill('x'))).toBe(false);
  });
});

describe('useCategoryStore', () => {
  const UID = 'test-uid-cat';

  beforeEach(() => {
    // Reset the store by replacing the top-level `byUid` reference via
    // Zustand's setState — that's the only path that wakes subscribers
    // and prevents stale bucket leakage between tests.
    useCategoryStore.setState({ byUid: {} });
  });

  it('hydrate populates the bucket for a uid that has no customs yet', () => {
    useCategoryStore.getState().hydrate(UID, {
      customFavoriteCuisines: ['Korean'],
      customEquipment: ['Sous-vide'],
    });
    const bucket = useCategoryStore.getState().byUid[UID];
    expect(bucket?.customFavoriteCuisines).toEqual(['Korean']);
    expect(bucket?.customEquipment).toEqual(['Sous-vide']);
  });

  it('hydrate is "seed if absent": leaves an existing bucket untouched', () => {
    useCategoryStore.getState().hydrate(UID, {
      customFavoriteCuisines: ['Korean'],
      customEquipment: [],
    });
    useCategoryStore.getState().hydrate(UID, {
      customFavoriteCuisines: ['Vietnamese'], // should NOT overwrite
      customEquipment: ['Sous-vide'], // also should NOT overwrite (empty stays empty under no-op)
    });
    const bucket = useCategoryStore.getState().byUid[UID]!;
    expect(bucket.customFavoriteCuisines).toEqual(['Korean']);
    expect(bucket.customEquipment).toEqual([]);
  });

  it('addCustom accepts a new name and surfaces normalised value', () => {
    useCategoryStore.getState().hydrate(UID, {
      customFavoriteCuisines: [],
      customEquipment: [],
    });
    const ok = useCategoryStore.getState().addCustom(UID, 'favoriteCuisines', '  korean  ');
    expect(ok).toEqual({ ok: true, value: 'Korean' });
    expect(useCategoryStore.getState().byUid[UID]?.customFavoriteCuisines).toEqual([
      'Korean',
    ]);
  });

  it('addCustom rejects a duplicate (case-insensitive)', () => {
    useCategoryStore.getState().hydrate(UID, {
      customFavoriteCuisines: ['Korean'],
      customEquipment: [],
    });
    const dup = useCategoryStore.getState().addCustom(
      UID,
      'favoriteCuisines',
      'KOREAN',
    );
    expect(dup).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('addCustom rejects empty input', () => {
    useCategoryStore.getState().hydrate(UID, {
      customFavoriteCuisines: [],
      customEquipment: [],
    });
    expect(
      useCategoryStore.getState().addCustom(UID, 'favoriteCuisines', '   '),
    ).toEqual({ ok: false, reason: 'empty' });
  });

  it('addCustom enforces the 20-item cap', () => {
    useCategoryStore.getState().hydrate(UID, {
      customFavoriteCuisines: Array(20).fill('x').map((_, i) => `Cuisine ${i}`),
      customEquipment: [],
    });
    const capped = useCategoryStore.getState().addCustom(
      UID,
      'favoriteCuisines',
      'Twenty-first',
    );
    expect(capped).toEqual({ ok: false, reason: 'cap' });
  });

  it('removeCustom drops the matching value exactly (not case-folded)', () => {
    useCategoryStore.getState().hydrate(UID, {
      customFavoriteCuisines: ['Korean', 'Vietnamese'],
      customEquipment: [],
    });
    useCategoryStore.getState().removeCustom(UID, 'favoriteCuisines', 'Korean');
    expect(useCategoryStore.getState().byUid[UID]?.customFavoriteCuisines).toEqual([
      'Vietnamese',
    ]);
  });

  it('removeCustom is a no-op for an unknown value', () => {
    useCategoryStore.getState().hydrate(UID, {
      customFavoriteCuisines: ['Korean'],
      customEquipment: [],
    });
    useCategoryStore.getState().removeCustom(UID, 'favoriteCuisines', 'Ethiopian');
    expect(useCategoryStore.getState().byUid[UID]?.customFavoriteCuisines).toEqual([
      'Korean',
    ]);
  });

  it('reconcileCustoms drops customs shadowed by new defaults', () => {
    const out = reconcileCustoms(['Italian', 'Mexican'], ['Italian', 'Korean']);
    expect(out.available).toEqual(['Italian', 'Mexican', 'Korean']);
    expect(out.droppedFromCustoms).toEqual(['Italian']);
  });
});

describe('source wiring', () => {
  it('UserProfileSchema exports the new custom-categories fields', () => {
    const schemas = readSrc('src/schemas/auth.ts');
    expect(schemas).toMatch(/customFavoriteCuisines:\s*z\.array\(/);
    expect(schemas).toMatch(/customEquipment:\s*z\.array\(/);
  });

  it('firestore.rules allowlist includes the new custom-categories fields', () => {
    const rules = readSrc('firestore.rules');
    expect(rules).toMatch(/'customFavoriteCuisines'/);
    expect(rules).toMatch(/'customEquipment'/);
  });

  it('SettingsPage imports + uses CategoryChipTray + shared defaults', () => {
    const settingsPage = readSrc('src/features/settings/SettingsPage.tsx');
    expect(settingsPage).toMatch(/import\s*{\s*CategoryChipTray\s*}\s*from\s*'.\/CategoryChipTray'/);
    expect(settingsPage).toMatch(/defaults=\{DEFAULT_FAVORITE_CUISINES\}/);
    expect(settingsPage).toMatch(/defaults=\{DEFAULT_AVAILABLE_EQUIPMENT\}/);
    // No more hardcoded 8-item cuisine array in the cuisines fieldset.
    expect(settingsPage).not.toMatch(
      /\['Italian',\s*'Mexican',\s*'Greek',\s*'Indian',\s*'Japanese',\s*'Thai',\s*'North African',\s*'American'\]/,
    );
  });

  it('NewPlanPage uses shared DEFAULT_* constants from settings/categories', () => {
    const newPlan = readSrc('src/features/meal-plans/NewPlanPage.tsx');
    expect(newPlan).toMatch(/DEFAULT_AVAILABLE_EQUIPMENT/);
    expect(newPlan).toMatch(/DEFAULT_FAVORITE_CUISINES/);
    // No more local "CUISINES" or "EQUIPMENT" constants.
    expect(newPlan).not.toMatch(/const\s+CUISINES\s*=/);
    expect(newPlan).not.toMatch(/const\s+EQUIPMENT\s*=/);
  });

  it('CategoryChipTray exposes dedupe + inline add affordance + selection toggle', () => {
    const tray = readSrc('src/features/settings/CategoryChipTray.tsx');
    expect(tray).toMatch(/Add custom/);
    expect(tray).toMatch(/isCategoryDuplicate/);
    expect(tray).toMatch(/toggle\(value\)/);
  });

  it('categoryStore exports the hydration + addCustom public API', () => {
    const store = readSrc('src/features/settings/categoryStore.ts');
    expect(store).toMatch(/hydrate:/);
    expect(store).toMatch(/addCustom:/);
    expect(store).toMatch(/removeCustom:/);
    expect(store).toMatch(/export\s+const\s+useCategoryStore\s*=/);
  });

  it('shared defaults stay consistent across screens', () => {
    expect(DEFAULT_FAVORITE_CUISINES).toContain('Italian');
    expect(DEFAULT_FAVORITE_CUISINES).toContain('Thai');
    expect(DEFAULT_AVAILABLE_EQUIPMENT).toContain('Stovetop');
    expect(DEFAULT_AVAILABLE_EQUIPMENT).toContain('Air fryer');
  });
});
