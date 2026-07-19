import { describe, expect, it } from 'vitest';

import { consolidate } from '@/features/shopping-list/consolidate';
import { normalizeName, toBaseUnit } from '@/utils/normalize';

const ing = (overrides: Partial<Parameters<typeof consolidate>[0][number]>) => ({
  name: 'Onion',
  normalizedName: 'onion',
  quantity: 1,
  unit: 'piece' as const,
  category: 'produce' as const,
  displayText: '1 piece onion',
  isOptional: false,
  isPantryItem: false,
  allergenFlags: [],
  recipeName: 'R1',
  ...overrides,
});

describe('shopping list consolidation', () => {
  it('combines two identical entries into one with summed quantity', () => {
    const items = consolidate([
      ing({}),
      ing({ recipeName: 'R2' }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBeCloseTo(2);
  });

  it('normalizes kg to g before grouping', () => {
    const items = consolidate([
      ing({ name: 'Onion', normalizedName: 'onion', unit: 'kg', quantity: 1, displayText: '1 kg onion' }),
      ing({ name: 'Onion', normalizedName: 'onion', unit: 'g', quantity: 200, displayText: '200 g onion' }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].unit).toBe('g');
    expect(items[0].quantity).toBeCloseTo(1200);
  });

  it('normalizes l to ml before grouping', () => {
    const items = consolidate([
      ing({ name: 'Stock', normalizedName: 'stock', unit: 'l', quantity: 1, category: 'pantry', displayText: '1 l stock' }),
      ing({ name: 'Stock', normalizedName: 'stock', unit: 'ml', quantity: 250, category: 'pantry', displayText: '250 ml stock', recipeName: 'R2' }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].unit).toBe('ml');
    expect(items[0].quantity).toBeCloseTo(1250);
  });

  it('separates incompatible unit families', () => {
    const items = consolidate([
      ing({ unit: 'g', quantity: 100, displayText: '100 g onion' }),
      ing({ unit: 'piece', quantity: 1, displayText: '1 piece onion', recipeName: 'R2' }),
    ]);
    expect(items).toHaveLength(2);
  });

  it('keeps distinct preparations separated', () => {
    const items = consolidate([
      ing({ preparationNote: 'sliced' }),
      ing({ preparationNote: 'diced', recipeName: 'R2' }),
    ]);
    expect(items.map((i) => i.preparationNote).sort()).toEqual(['diced', 'sliced']);
  });

  it('separates optional vs required', () => {
    const items = consolidate([
      ing({}),
      ing({ isOptional: true, recipeName: 'R2' }),
    ]);
    expect(items).toHaveLength(2);
  });

  it('surfaces pantry items in their own group', () => {
    const items = consolidate(
      [ing({})],
      ['Olive oil'],
    );
    const last = items[items.length - 1];
    expect(last.isPantryItem).toBe(true);
    expect(last.name).toBe('Olive oil');
  });

  it('pluralizes the unit for qty > 1', () => {
    const items = consolidate([
      ing({ quantity: 3 }),
    ]);
    expect(items[0].displayText).toContain('pieces');
  });

  it('stays singular for qty == 1', () => {
    const items = consolidate([
      ing({ quantity: 1 }),
    ]);
    expect(items[0].displayText).toContain('piece');
    expect(items[0].displayText).not.toContain('pieces');
  });

  it('is idempotent', () => {
    const inputs = [
      ing({ quantity: 2 }),
      ing({ quantity: 1, recipeName: 'Rx' }),
    ];
    const first = consolidate(inputs);
    // Re-consolidate the result list (treated as a flat recipe of one).
    const flat = first.flatMap((it) => [
      { ...it, recipeName: 'A', recipeId: 'A' },
      { ...it, recipeName: 'B', recipeId: 'B' },
    ]);
    const second = consolidate(flat);
    // Quantities should double (we doubled the inputs).
    expect(second[0].quantity).toBeCloseTo(first[0].quantity * 2);
  });
});

describe('normalize helpers', () => {
  it('strips minimal plurals', () => {
    expect(normalizeName('tomatoes')).toBe('tomato');
    expect(normalizeName('potatoes')).toBe('potato');
    expect(normalizeName('cloves')).toBe('clove');
    expect(normalizeName('cherries')).toBe('cherry');
  });

  it('converts tb / cup / l to base units', () => {
    expect(toBaseUnit('kg', 2)).toEqual({ unit: 'g', quantity: 2000 });
    expect(toBaseUnit('l', 1)).toEqual({ unit: 'ml', quantity: 1000 });
    expect(toBaseUnit('tbsp', 2)).toEqual({ unit: 'tsp', quantity: 6 });
  });
});
