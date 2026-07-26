/**
 * Offline smoke tests for `CookModePage.tsx` (PR #4 hands-busy Cook
 * Mode + voice). Mirrors the proven `prompts.test.ts` and
 * `serverStamp.test.ts` pattern: read source on disk with
 * `readFileSync` and assert on the key invariants.
 *
 * Why structural (source-read) instead of functional imports
 * ------------------------------------------------------------
 * The CookingMode component imports `react-router-dom`, the auth
 * context, `VoiceCommandListener`, plus `lucide-react` icons. Loading
 * it through Vitest would pull all of those into the test runtime,
 * which is not what we want for a fast offline smoke test.
 *
 * What we catch
 * -------------
 *  • All five module-private helpers are defined and well-typed:
 *      `toLinearSteps`, `fmtClock`, `loadStored`, `saveStored`,
 *      `clearStored`.
 *  • The 12-hour TTL is wired (PERSIST_TTL_MS = 12 * 60 * 60 * 1000).
 *  • The `toLinearSteps` helper wires the three-step phase order
 *    (preparation → cooking → presentation) and tags every emitted
 *    step with `globalIndex`.
 *  • The voice-command grammar (next / back / done / repeat /
 *    start-timer / cancel-timer / stop-listening) is intact.
 *  • Per-step `durationSeconds`-driven timer button is wired.
 *  • Manual duration picker fallback exists for steps that lack
 *    `durationSeconds`.
 *  • The chip-tray overlay uses `aria-live="polite"` for the
 *    remaining-clock label.
 *  • Phase divider chips ("Step N / M" + "Prep" / "Cook" / "Serve")
 *    are rendered on the current-step card.
 *  • The component default-exports `CookModePage`.
 *
 * Helper: `extractCallSlice(src, openParenIdx)` walks forward from
 * the position of an opening paren (paren depth 1) until it reaches
 * the matching closing paren, tracking JS string + template + line-
 * comment + block-comment depth along the way. Used for robust
 * block-extraction of `voiceEnabled && <VoiceCommandListener ... />`
 * and the voice intent grammar block.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COOK_SRC = readFileSync(
  resolve(__dirname, '../src/features/recipes/CookModePage.tsx'),
  'utf8',
);

const extractCallSlice = (
  src: string,
  openParenIdx: number,
): string | null => {
  // Find the closing-paren matching the (paren at openParenIdx).
  // Tracks line + block comments, single + double + template quotes,
  // and one level of nested ${…} brace pairs inside template literals.
  let i = openParenIdx + 1;
  let parenDepth = 1;
  let braceDepth = 0;
  // For tracking JS contexts that need to ignore the next ')' etc.
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;
  while (i < src.length) {
    const ch = src[i];
    const prev = i > 0 ? src[i - 1] : '';
    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      if (prev === '*' && ch === '/') inBlockComment = false;
      i++;
      continue;
    }
    if (inSingle) {
      if (prev !== '\\' && ch === "'") inSingle = false;
      i++;
      continue;
    }
    if (inDouble) {
      if (prev !== '\\' && ch === '"') inDouble = false;
      i++;
      continue;
    }
    if (inTemplate) {
      if (prev !== '\\' && ch === '`') {
        inTemplate = false;
        i++;
        continue;
      }
      i++;
      continue;
    }
    // Not in any string region.
    if (ch === '/' && src[i + 1] === '/') {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      inBlockComment = true;
      i += 2;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      i++;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      i++;
      continue;
    }
    if (ch === '`') {
      inTemplate = true;
      i++;
      continue;
    }
    if (parenDepth === 1 && ch === ')') {
      return src.slice(openParenIdx, i + 1);
    }
    if (ch === '(') parenDepth++;
    else if (ch === ')') parenDepth--;
    else if (ch === '{') braceDepth++;
    else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
    i++;
  }
  return null;
};

const locateFirst = (src: string, needle: string): number => {
  const idx = src.indexOf(needle);
  expect(idx, `expected to find ${needle} in CookModePage.tsx`).toBeGreaterThan(-1);
  return idx;
};

describe('CookModePage.tsx — module wiring', () => {
  it('imports React hooks + react-router-dom + lucide icons', () => {
    expect(COOK_SRC).toMatch(/import\s*\{[^}]*useCallback[^}]*useEffect[^}]*useMemo[^}]*useRef[^}]*useState[^}]*\}\s*from\s*'react'/);
    expect(COOK_SRC).toMatch(/from\s*'react-router-dom'/);
    expect(COOK_SRC).toMatch(/from\s*'lucide-react'/);
  });

  it('default-exports CookModePage', () => {
    expect(COOK_SRC).toMatch(/export\s+default\s+CookModePage/);
  });

  it('exports the named CookModePage (for router)', () => {
    expect(COOK_SRC).toMatch(/export\s+const\s+CookModePage\s*=/);
  });
});

describe('CookModePage.tsx — helpers present + properly typed', () => {
  it('declares PERSIST_TTL_MS as 12 * 60 * 60 * 1000', () => {
    expect(COOK_SRC).toMatch(
      /const\s+PERSIST_TTL_MS\s*=\s*12\s*\*\s*60\s*\*\s*60\s*\*\s*1000/,
    );
  });

  it('declares `persistKey` factory keyed by recipe id', () => {
    expect(COOK_SRC).toMatch(/const\s+persistKey\s*=\s*\(recipeId:\s*string\)/);
    expect(COOK_SRC).toContain('freebuff:cook:');
  });

  it('defines `toLinearSteps(recipe: Recipe): LinearStep[]`', () => {
    expect(COOK_SRC).toMatch(/const\s+toLinearSteps\s*=\s*\(recipe:\s*Recipe\)/);
    expect(COOK_SRC).toMatch(/:\s*LinearStep\[\]\s*=>/);
  });

  it('toLinearSteps walks preparationSteps in order', () => {
    // Tag every preparation step with phase='preparation' (and the
    // stream key). This is what makes the phase divider chip render
    // a "Prep" label.
    expect(COOK_SRC).toContain("phase: 'preparation'");
    expect(COOK_SRC).toMatch(/for\s*\(const\s+step\s+of\s+recipe\.preparationSteps\)/);
  });

  it('toLinearSteps walks cookingSteps after preparation', () => {
    expect(COOK_SRC).toContain("phase: 'cooking'");
    expect(COOK_SRC).toMatch(/for\s*\(const\s+step\s+of\s+recipe\.cookingSteps\)/);
  });

  it('toLinearSteps appends presentationSuggestions after cooking', () => {
    expect(COOK_SRC).toContain("phase: 'presentation'");
    expect(COOK_SRC).toMatch(/recipe\.presentationSuggestions\.forEach/);
  });

  it('toLinearSteps covers all three phase chips', () => {
    const idx = locateFirst(COOK_SRC, 'const toLinearSteps');
    const slice = COOK_SRC.slice(idx, idx + 1500);
    expect(slice).toContain("phase: 'preparation'");
    expect(slice).toContain("phase: 'cooking'");
    expect(slice).toContain("phase: 'presentation'");
  });

  it('defines `fmtClock(ms: number): string` rendering m:ss', () => {
    expect(COOK_SRC).toMatch(/const\s+fmtClock\s*=\s*\(ms:\s*number\)/);
    expect(COOK_SRC).toMatch(/:\s*string\s*=>/);
    // Confirm the formula: minutes floor + seconds ceil + padStart(2, '0').
    expect(COOK_SRC).toMatch(/padStart\(\s*2\s*,\s*['"]0['"]\s*\)/);
  });

  it('defines loadStored honoring TTL + JSON shape', () => {
    expect(COOK_SRC).toMatch(/const\s+loadStored\s*=\s*\(recipeId:\s*string\)/);
    expect(COOK_SRC).toMatch(/:\s*StoredProgress\s*\|\s*null\s*=>/);
    expect(COOK_SRC).toContain('Date.now() - parsed.lastUpdatedAt > PERSIST_TTL_MS');
    expect(COOK_SRC).toContain('return null;');
  });

  it('defines saveStored storing stepIndex + flags + lastUpdatedAt', () => {
    expect(COOK_SRC).toMatch(/const\s+saveStored\s*=\s*\(recipeId:\s*string,\s*progress:\s*Omit<StoredProgress/);
    expect(COOK_SRC).toContain('lastUpdatedAt: Date.now()');
  });

  it('defines clearStored for recipe completion', () => {
    expect(COOK_SRC).toMatch(/const\s+clearStored\s*=\s*\(recipeId:\s*string\)/);
    expect(COOK_SRC).toContain('localStorage.removeItem');
  });
});

describe('CookModePage.tsx — voice-command grammar', () => {
  it('handles all 7 intents in the switch', () => {
    const idx = locateFirst(COOK_SRC, "switch (intent)");
    const slice = COOK_SRC.slice(idx, idx + 2000);
    for (const intent of [
      "case 'next':",
      "case 'back':",
      "case 'done':",
      "case 'repeat':",
      "case 'start-timer':",
      "case 'cancel-timer':",
      "case 'stop-listening':",
    ]) {
      expect(slice, `expected ${intent} in handleIntent`).toContain(intent);
    }
  });

  it('uses VoiceCommandListener component for hands-busy', () => {
    expect(COOK_SRC).toMatch(/<VoiceCommandListener\b/);
    expect(COOK_SRC).toMatch(/enabled=\{voiceEnabled\}/);
    expect(COOK_SRC).toMatch(/onIntent=\{handleIntent\}/);
  });

  it('stops listening on stop-listening intent', () => {
    const idx = locateFirst(COOK_SRC, "case 'stop-listening':");
    const slice = COOK_SRC.slice(idx, idx + 200);
    expect(slice).toContain('setVoiceEnabled(false)');
  });
});

describe('CookModePage.tsx — current-step card UI surface', () => {
  it('renders "Step N / M" chip + Prep/Cook/Serve phase chip', () => {
    expect(COOK_SRC).toMatch(/Step\s*\{stepIndex\s*\+\s*1\}\s*\/\s*\{steps\.length\}/);
    expect(COOK_SRC).toContain("bg-tomato-100");
    expect(COOK_SRC).toContain("bg-basil-100");
  });

  it('renders the phase label interpolated from step.phase', () => {
    const idx = locateFirst(COOK_SRC, 'const phaseLabel');
    const slice = COOK_SRC.slice(idx, idx + 400);
    expect(slice).toContain("step.phase === 'preparation'");
    expect(slice).toContain("step.phase === 'cooking'");
    // The presentation-phase fallback uses the user-facing label
    // 'Serve' (mirrors the UI chip 'Step 3 / 4 · Serve' on the cooked
    // dish). Past iterations used the literal 'Presentation' but the
    // designer landed on 'Serve' for the chip and we mirror source.
    expect(slice).toContain("'Serve'");
    expect(slice).toContain("'Prep'");
    expect(slice).toContain("'Cook'");
  });

  it('uses aria-live="polite" on status announcement', () => {
    expect(COOK_SRC).toMatch(/role="status"[^>]*aria-live="polite"|aria-live="polite"[^>]*role="status"/);
  });

  it('has Suggested minutes visible next to step.durationSeconds', () => {
    expect(COOK_SRC).toMatch(/durationSeconds\s*\/\s*60/);
    expect(COOK_SRC).toContain('Suggested:');
  });
});

describe('CookModePage.tsx — timer wiring', () => {
  it('startStepTimer uses step.durationSeconds × 1000 ms', () => {
    const idx = locateFirst(COOK_SRC, 'const startStepTimer');
    const slice = COOK_SRC.slice(idx, idx + 600);
    expect(slice).toMatch(/durationSeconds\s*\*\s*1000/);
    expect(slice).toMatch(/startedAt:\s*Date\.now/);
  });

  it('startManualTimer clamps to >= 60_000 ms', () => {
    const idx = locateFirst(COOK_SRC, 'const startManualTimer');
    const slice = COOK_SRC.slice(idx, idx + 400);
    expect(slice).toMatch(/Math\.max\(\s*60_000/);
    expect(slice).toMatch(/manualDurationMin\s*\*\s*60_000/);
  });

  it('has a chip-tray overlay for the active timer', () => {
    // Whole-source presence checks for each chip-tray cue. Multi-line
    // JSX props (`aria-live` on its own line, etc.) make forward slicing
    // brittle; bottom-up `.toContain` is robust to JSX line breaks and
    // re-ordering of independent attributes.
    expect(COOK_SRC).toContain('role="status"');
    expect(COOK_SRC).toContain('aria-live="polite"');
    expect(COOK_SRC).toMatch(/fixed\s+left-1\/2/);
    expect(COOK_SRC).toContain('bg-pepper-700');
    expect(COOK_SRC).toContain('shadow-warm');
    expect(COOK_SRC).toContain('strokeDasharray');
    expect(COOK_SRC).toContain('fmtClock(remainingMs)');
    expect(COOK_SRC).toMatch(/\{totalLabel\}/);
  });

  it('fires toast + TTS when the timer hits zero', () => {
    const idx = locateFirst(COOK_SRC, "if (elapsed >= activeTimer.durationMs)");
    const slice = COOK_SRC.slice(idx, idx + 500);
    expect(slice).toContain('toast.push');
    expect(slice).toMatch(/title:\s*['"]Timer done['"]/);
    expect(slice).toMatch(/speak\(['"]Timer done\.['"]\)/);
  });

  it('cancelActiveTimer is exposed as a voice + chip-tray action', () => {
    expect(COOK_SRC).toMatch(/const\s+cancelActiveTimer\s*=\s*useCallback/);
    expect(COOK_SRC).toContain('setActiveTimer(null)');
  });
});

describe('CookModePage.tsx — persistence wiring', () => {
  it('saves on every state change after steps loaded', () => {
    expect(COOK_SRC).toContain('saveStored(recipeId, { stepIndex, voiceEnabled, ttsEnabled })');
    expect(COOK_SRC).toMatch(/if\s*\(\s*steps\.length\s*===\s*0\s*\)\s*return;/);
  });

  it('resumes stepIndex clamping to within bounds', () => {
    const idx = locateFirst(COOK_SRC, '// 2. Resume from localStorage');
    const slice = COOK_SRC.slice(idx, idx + 400);
    expect(slice).toMatch(/Math\.min\(\s*stored\.stepIndex\s*,\s*Math\.max\(\s*0\s*,\s*steps\.length\s*-\s*1\s*\)\s*\)/);
  });

  it('clears storage on recipe completion', () => {
    expect(COOK_SRC).toMatch(/if\s*\(\s*recipeId\s*\)\s*clearStored\(\s*recipeId\s*\)/);
  });
});

describe('CookModePage.tsx — call-slice helper trust', () => {
  it('walks forward from an opening `(` and extracts a balanced slice', () => {
    // `cancelActiveTimer();` — the strip `cancelActiveTimer()` is a
    // substring of `cancelActiveTimer();` so locateFirst still hits
    // the right index even though the call is followed by a `;`.
    const opArrow = locateFirst(COOK_SRC, 'cancelActiveTimer();');
    const openParenIdx = COOK_SRC.indexOf('(', opArrow);
    expect(openParenIdx).toBeGreaterThan(-1);
    const slice = extractCallSlice(COOK_SRC, openParenIdx);
    // Walker returns from `(` to `)` inclusive → just the parens.
    expect(slice, 'expected to extract a non-empty slice').not.toBeNull();
    expect(slice).toBe('()');
    const opArrow2 = locateFirst(COOK_SRC, 'startStepTimer(stepIndex)');
    const op2 = COOK_SRC.indexOf('(', opArrow2);
    const slice2 = extractCallSlice(COOK_SRC, op2);
    expect(slice2).toBe('(stepIndex)');
  });
});
