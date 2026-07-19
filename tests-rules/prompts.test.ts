/**
 * Offline smoke tests for the AI system-prompt versions.
 *
 * Reads `functions/src/ai/prompts/system.ts` on disk and inspects the
 * resulting source text against string + regex assertions about:
 *   • the recorded `PROMPT_VERSION` constant,
 *   • the V1 base prompt content (non-regression: 15 strict rules,
 *     authenticity vocabulary),
 *   • the V2-Affordances appendage content (timers / ratios / honest
 *     allergens / metadata).
 *
 * Why we don't `import` the file: vitest does not always resolve a
 * relative path into `functions/` cleanly without an alias, and the
 * `firestore.test.ts` already follows this on-disk-read pattern for
 * the rules file. The test stays offline, fast, and asserts on what
 * actually ships.
 *
 * Why we don't regex-extract the full V2 template literal: nested
 * `\`` (escaped back-ticks for inline code) confuse a lazy `*?\`;`
 * capture. We instead split on the explicit `V2 affordances — ` marker
 * — deterministic and survives escape sequences.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(
  resolve(__dirname, '../functions/src/ai/prompts/system.ts'),
  'utf8',
);

/**
 * Anchor: every V2 affordance is appended AFTER the literal string
 * `V2 affordances — ` in the source. Splitting on that marker gives
 * us the V1 portion (everything before) and the V2 appendage (from
 * the marker onward, including the marker for positive assertions).
 */
const V2_MARKER = 'V2 affordances — ';
const V2_START = SRC.indexOf(V2_MARKER);
if (V2_START < 0) {
  throw new Error('"V2 affordances — " marker not found in system.ts.');
}
const V1 = SRC.slice(0, V2_START);
const V2_APPENDAGE = SRC.slice(V2_START);

const PROMPT_VERSION = (SRC.match(/PROMPT_VERSION\s*=\s*['"]([^'"]+)['"]/) ?? [])[1];
if (!PROMPT_VERSION) {
  throw new Error('PROMPT_VERSION constant not found in source.');
}

describe('SYSTEM_PROMPT versioning', () => {
  it('records PROMPT_VERSION as "v2"', () => {
    expect(PROMPT_VERSION).toBe('v2');
  });

  it('exports both V1 and V2', () => {
    // Both exports live BEFORE the `'V2 affordances — '` marker (which
    // is inside V2's template literal body), so assert against the
    // whole source rather than one slice.
    expect(SRC).toContain('export const SYSTEM_PROMPT_V1');
    expect(SRC).toContain('export const SYSTEM_PROMPT_V2');
  });

  it('keeps V1 byte-stable (V2 prefixes the source with V1 verbatim)', () => {
    // V2's runtime value = V1 + "\n\n" + V2 appendage. The V1 export
    // therefore must contain the upstream V2's template-literal
    // reference (uppercase, exactly).
    expect(V1).toContain('SYSTEM_PROMPT_V1'); // referenced by V2's `${SYSTEM_PROMPT_V1}` interpolation
    expect(V1).toContain('You are an expert home-cook helper');
  });

  it('V2 appendage contains a clearly-marked Cook Mode & Substitutions section', () => {
    expect(V2_APPENDAGE).toContain('V2 affordances');
    expect(V2_APPENDAGE).toContain('Cook Mode');
    expect(V2_APPENDAGE).toContain('Substitutions');
  });
});

describe('V2 affordance A — per-step timers (durationSeconds)', () => {
  it('instructs the model to emit WHOLE-SECOND integers', () => {
    expect(V2_APPENDAGE).toMatch(/WHOLE SECONDS/);
    expect(V2_APPENDAGE).toContain('480'); // 8 minutes → seconds
  });

  it('forbids minute strings, raw minutes, and ranges', () => {
    // Gemini otherwise outputs "8 min" / 8 / "5-8 min"; the prompt
    // explicitly tells the model what NOT to do.
    const a = V2_APPENDAGE.toLowerCase();
    expect(a).toContain('never as a string');
    expect(a).toContain('never in minutes');
    expect(a).toContain('never as a range');
  });

  it('defines when to omit (untimed steps)', () => {
    expect(V2_APPENDAGE).toContain('WHEN TO OMIT');
    expect(V2_APPENDAGE).toContain('dice the onion');
    expect(V2_APPENDAGE).toContain('cook until golden');
  });
});

describe('V2 affordance B — substitution ratios', () => {
  it('instructs the model to emit `ratio` for potency-concentrated swaps', () => {
    expect(V2_APPENDAGE).toContain('ratio');
    expect(V2_APPENDAGE).toContain('0.125'); // canonical: 1 clove garlic → 1/8 tsp powder
  });

  it('gives an equal-form example with ratio: 1', () => {
    expect(V2_APPENDAGE).toContain('ratio: 1');
  });

  it('exposes the three ratio categories the prompt teaches', () => {
    expect(V2_APPENDAGE).toContain('Equal form');
    expect(V2_APPENDAGE).toContain('Potency-concentrated');
    expect(V2_APPENDAGE).toContain('Form-replaced');
  });
});

describe('V2 affordance C — addedAllergens (delta, not full list)', () => {
  it('forces the model to use the Allergen enum values verbatim', () => {
    // The prompt lists every enum value the schema accepts so the
    // model doesn't hallucinate variants (parabens, "nuts" plural…).
    for (const v of [
      'gluten',
      'dairy',
      'eggs',
      'soy',
      'peanuts',
      'tree_nuts',
      'fish',
      'shellfish',
      'sesame',
      'wheat',
      'mustard',
      'celery',
      'sulfites',
    ]) {
      expect(V2_APPENDAGE).toContain(v);
    }
  });

  it('uses the canonical butter→margarine example to make the off-by-one explicit', () => {
    expect(V2_APPENDAGE).toContain('butter');
    expect(V2_APPENDAGE).toContain('margarine');
    // Explicit "do NOT re-list `dairy`" guard so the model doesn't
    // double-count allergens that were already on the original.
    expect(V2_APPENDAGE).toContain('Do NOT re-list');
  });
});

describe('V2 affordance D — generation metadata stamping', () => {
  it('tells the model the exact promptVersion reference to write', () => {
    // The appendage references `${PROMPT_VERSION}` via template
    // interpolation; this compiles to `"v2"` at module-load time.
    expect(V2_APPENDAGE).toContain('${PROMPT_VERSION}');
    expect(PROMPT_VERSION).toBe('v2');
  });

  it('tells the model the exact modelName to write', () => {
    expect(V2_APPENDAGE).toContain('"gemini-2.0-flash"');
  });
});

describe('V2 non-regression — V1 portion is preserved', () => {
  it('preserves all 15 of the V1 strict rules (in V1 slice)', () => {
    // Each rule line is formatted `{n}. {rule text}` so we anchor on
    // `\b{n}\. ` (digit, period, space). The leading `\b` blocks the
    // false-match where e.g. `\b1\. ` would match the leading digit of
    // `11.`; the trailing space matches the source formatting exactly.
    for (let i = 1; i <= 15; i += 1) {
      expect(V1).toMatch(new RegExp(`\\b${i}\\. `));
    }
  });

  it('preserves the authenticity-label vocabulary verbatim (in V1 slice)', () => {
    // Rule 2 wording the model calibrates against.
    expect(V1).toContain("'traditional'");
    expect(V1).toContain("'widely_recognized'");
    expect(V1).toContain("'common_variation'");
    expect(V1).toContain("'adapted_to_preferences'");
  });

  it('preserves the "Output strict JSON" rule 14 (in V1 slice)', () => {
    expect(V1).toMatch(/14\. Output strict JSON/);
  });
});
