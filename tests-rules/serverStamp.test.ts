/**
 * Offline smoke tests for the server-stamped `generationMetadata`
 * helper PLUS its wiring inside `generateMealPlanFlow`.
 *
 * Why structural (source-read) instead of functional imports
 * ------------------------------------------------------------
 * Vitest has resolution friction for cross-package imports into
 * `functions/` — established by the rewrite of
 * `tests-rules/prompts.test.ts` (from a relative import to an
 * on-disk read). We follow the same proven pattern: read the helper
 * source and the flow source via `readFileSync`, then assert on the
 * key invariants. Deterministic, fast, offline.
 *
 * What we catch
 * -------------
 *  • `STAMPED_MODEL_NAME` is a top-level const, literal "gemini-2.0-flash".
 *  • `ServerStampContext` requires the right three fields with the
 *    right TypeScript types (0 | 1 for retryCount, etc.).
 *  • `stampGenerationMetadata` is an exported function with the
 *    (plan, ctx) → MealPlan signature, and its body overrides every
 *    one of the six `generationMetadata` fields.
 *  • `generateMealPlanFlow` actually CALLS `stampGenerationMetadata`
 *    on both return paths (first-pass + repair-pass) and computes a
 *    wall-clock `startedAtMs` anchor between input-parse and the
 *    first Genkit call.
 *  • Repair-failure path emits a structured `console.warn` carrying
 *    identity (model + promptVersion), the failed validation flag,
 *    AND both pass-error messages BEFORE throwing a generic
 *    internal HttpsError.
 *
 * Helper: `extractCallSlice(src, openParenIdx)` walks forward from
 * the position of an opening paren (paren depth 1) until it reaches
 * the matching closing paren, tracking JS string + template + brace
 * + bracket + comment depth along the way. We use it for block
 * extraction of `stampGenerationMetadata(parsed.data, {…})` calls
 * so the assertion doesn't truncate mid-object when the ctx grows.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STAMP_SRC = readFileSync(
  resolve(__dirname, '../functions/src/ai/audit/stamp.ts'),
  'utf8',
);
const FLOW_SRC = readFileSync(
  resolve(__dirname, '../functions/src/ai/flows/generateMealPlanFlow.ts'),
  'utf8',
);

/**
 * Walk a source string forward from `openParenIdx` (a literal `(`),
 * tracking JS string + template-literal + brace/bracket/comment
 * depth, until the matching `)` lands at paren depth 0. Returns the
 * substring from `openParenIdx` up to AND including the matching
 * `)`. Returns `null` if no balance is reached (defensive — the
 * walk continues until EOF).
 *
 * Why bespoke: regex `\{[\s\S]*?\}` cannot stand for nested objects,
 * and the multi-line `stampGenerationMetadata(parsed.data, { … })`
 * ctx payload is exactly the shape we want to assert on. Hand-rolling
 * a small lexer is cheaper than pulling in a parser and keeps the
 * assertions sharp.
 */
function extractCallSlice(src: string, openParenIdx: number): string | null {
  let parenDepth = 0;
  let stringStart: string | null = null;
  let blockCommentDepth = 0;
  let inLineComment = false;
  let inTemplate = false;
  let i = openParenIdx;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      i += 1;
      continue;
    }
    if (blockCommentDepth > 0) {
      if (ch === '*' && next === '/') {
        blockCommentDepth -= 1;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (inTemplate) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === '`') {
        inTemplate = false;
        i += 1;
        continue;
      }
      i += 1;
      continue;
    }
    if (stringStart !== null) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === stringStart) {
        stringStart = null;
        i += 1;
        continue;
      }
      i += 1;
      continue;
    }

    // Token dispatch (we're not at paren depth < 0).
    if (ch === '/' && next === '/') {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (ch === '/' && next === '*') {
      blockCommentDepth += 1;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      stringStart = ch;
      i += 1;
      continue;
    }
    if (ch === '`') {
      inTemplate = true;
      i += 1;
      continue;
    }
    if (ch === '(') {
      parenDepth += 1;
      i += 1;
      continue;
    }
    if (ch === ')') {
      parenDepth -= 1;
      i += 1;
      if (parenDepth === 0) {
        return src.slice(openParenIdx, i);
      }
      continue;
    }
    i += 1;
  }
  return null;
}

describe('stamp helper — STAMPED_MODEL_NAME', () => {
  it('is exported as a top-level const', () => {
    expect(STAMP_SRC).toMatch(/export const STAMPED_MODEL_NAME\s*=/);
  });

  it('hard-codes the literal string "gemini-2.0-flash"', () => {
    expect(STAMP_SRC).toMatch(
      /STAMPED_MODEL_NAME\s*=\s*['"]gemini-2\.0-flash['"]/,
    );
  });
});

describe('stamp helper — ServerStampContext shape', () => {
  it('exports the ServerStampContext interface', () => {
    expect(STAMP_SRC).toMatch(/export interface ServerStampContext/);
  });

  it('requires durationMs as a number', () => {
    expect(STAMP_SRC).toMatch(/durationMs:\s*number/);
  });

  it('restricts retryCount to 0 | 1', () => {
    expect(STAMP_SRC).toMatch(/retryCount:\s*0\s*\|\s*1/);
  });

  it('restricts validation to "passed" | "repaired"', () => {
    expect(STAMP_SRC).toMatch(
      /validation:\s*['"]passed['"]\s*\|\s*['"]repaired['"]/,
    );
  });

  it('documents why "failed" is excluded — directly on the validation field', () => {
    const fieldIdx = STAMP_SRC.indexOf(
      "readonly validation: 'passed' | 'repaired';",
    );
    expect(fieldIdx).toBeGreaterThan(0);
    // Slice FROM the field backwards 1000 chars to pick up the JSDoc
    // immediately above the field. If the JSDoc ever grows past 1000
    // chars the assertion becomes vacuous — bump it then.
    const slice = STAMP_SRC.slice(Math.max(0, fieldIdx - 1000), fieldIdx);
    expect(slice).toMatch(/['"]failed['"]/);
    expect(slice).toMatch(/intentionally/);
  });
});

describe('stamp helper — stampGenerationMetadata signature', () => {
  it('exports a function', () => {
    expect(STAMP_SRC).toMatch(/export function stampGenerationMetadata\s*\(/);
  });

  it('accepts (plan: MealPlan, ctx: ServerStampContext)', () => {
    // Use substring checks rather than a brittle per-token regex so
    // future reformatting (commas, trailing whitespace, newlines
    // between args) doesn't false-fail this assertion.
    const sigIdx = STAMP_SRC.indexOf('export function stampGenerationMetadata');
    expect(sigIdx).toBeGreaterThan(0);
    const slice = STAMP_SRC.slice(sigIdx, sigIdx + 400);
    expect(slice).toContain('plan: MealPlan');
    expect(slice).toContain('ctx: ServerStampContext');
  });

  it('returns MealPlan', () => {
    // Same substring strategy: search the slice after the function
    // header for the return-type annotation. Tolerate any whitespace
    // placement around the colon.
    const sigIdx = STAMP_SRC.indexOf('export function stampGenerationMetadata');
    expect(sigIdx).toBeGreaterThan(0);
    const slice = STAMP_SRC.slice(sigIdx, sigIdx + 600);
    expect(slice).toMatch(/\)\s*:\s*MealPlan\b/);
  });
});

describe('stamp helper — body overwrites all 6 metadata fields', () => {
  it('overrides modelName with STAMPED_MODEL_NAME', () => {
    expect(STAMP_SRC).toMatch(/modelName:\s*STAMPED_MODEL_NAME/);
  });

  it('overrides promptVersion with PROMPT_VERSION', () => {
    expect(STAMP_SRC).toMatch(/promptVersion:\s*PROMPT_VERSION/);
  });

  it('stamps generatedAt with new Date().toISOString()', () => {
    expect(STAMP_SRC).toMatch(/generatedAt:\s*new Date\(\)\.toISOString\(\)/);
  });

  it('passes durationMs through from ctx', () => {
    expect(STAMP_SRC).toMatch(/durationMs:\s*ctx\.durationMs/);
  });

  it('passes retryCount through from ctx', () => {
    expect(STAMP_SRC).toMatch(/retryCount:\s*ctx\.retryCount/);
  });

  it('passes validation through from ctx', () => {
    expect(STAMP_SRC).toMatch(/validation:\s*ctx\.validation/);
  });

  it('preserves non-augmented fields via plan spread', () => {
    expect(STAMP_SRC).toMatch(/\.\.\.plan,/);
  });
});

describe('stamp helper — import wiring', () => {
  it('imports PROMPT_VERSION from ../prompts/system.js', () => {
    expect(STAMP_SRC).toMatch(
      /import\s*\{\s*PROMPT_VERSION\s*\}\s*from\s+['"]\.\.\/prompts\/system\.js['"]/,
    );
  });

  it('imports MealPlan type from ../schemas/index.js', () => {
    expect(STAMP_SRC).toMatch(/from\s+['"]\.\.\/schemas\/index\.js['"]/);
  });
});

describe('generateMealPlanFlow — wiring the helper', () => {
  it('source contains the helper symbol + stamp source path + identity constant', () => {
    // Multi-name import: `import { STAMPED_MODEL_NAME, stampGenerationMetadata } from '../audit/stamp.js'`.
    // We split into three `.toContain` checks so multi-name imports
    // and future identity-field additions don't false-fail this.
    expect(FLOW_SRC).toContain('stampGenerationMetadata');
    expect(FLOW_SRC).toContain("'../audit/stamp.js'");
    expect(FLOW_SRC).toContain('STAMPED_MODEL_NAME');
  });

  it('captures a startedAtMs anchor before the first Genkit call', () => {
    expect(FLOW_SRC).toMatch(/const startedAtMs\s*=\s*Date\.now\(\)/);
  });

  it('computes wall-clock durationMs as Date.now() - startedAtMs', () => {
    expect(FLOW_SRC).toMatch(/Date\.now\(\)\s*-\s*startedAtMs/);
  });

  it('calls stampGenerationMetadata on first-pass success', () => {
    expect(FLOW_SRC).toMatch(/stampGenerationMetadata\(parsed\.data,/);
  });

  it('first-pass return stamps validation="passed" + retryCount 0', () => {
    // Brace-walking block extraction: find the open-paren of the
    // call site, walk forward to the matching close-paren. No more
    // `slice(i, i + 400)` magic window.
    const callIdx = FLOW_SRC.indexOf('stampGenerationMetadata(parsed.data,');
    expect(callIdx).toBeGreaterThan(0);
    const opIdx = FLOW_SRC.indexOf('(', callIdx);
    expect(opIdx).toBeGreaterThan(0);
    const slice = extractCallSlice(FLOW_SRC, opIdx);
    expect(slice).not.toBeNull();
    expect(slice!).toContain("validation: 'passed'");
    expect(slice!).toMatch(/retryCount:\s*0/);
  });

  it('calls stampGenerationMetadata on repair-pass success', () => {
    expect(FLOW_SRC).toMatch(/stampGenerationMetadata\(repaired\.data,/);
  });

  it('repair-pass return stamps validation="repaired" + retryCount 1', () => {
    const callIdx = FLOW_SRC.indexOf('stampGenerationMetadata(repaired.data,');
    expect(callIdx).toBeGreaterThan(0);
    const opIdx = FLOW_SRC.indexOf('(', callIdx);
    expect(opIdx).toBeGreaterThan(0);
    const slice = extractCallSlice(FLOW_SRC, opIdx);
    expect(slice).not.toBeNull();
    expect(slice!).toContain("validation: 'repaired'");
    expect(slice!).toMatch(/retryCount:\s*1/);
  });
});

describe('generateMealPlanFlow — repair-failure logging', () => {
  it('logs a labelled warn before throwing on repair-failure', () => {
    // The throw path must emit a `console.warn(...)` with the
    // literal label `'[generateMealPlanFlow] generation failed validation'`
    // (single-quoted, brackets glued to the label) so Cloud Logging
    // can pivot on the label string. The throw itself still surfaces
    // a generic `internal` HttpsError so callers can't infer
    // internal drift.
    expect(FLOW_SRC).toMatch(
      /console\.warn\(\s*'\[generateMealPlanFlow\] generation failed validation'/,
    );
    expect(FLOW_SRC).toMatch(/validation:\s*['"]failed['"]/);
  });

  it('warn payload carries identity fields (modelName + promptVersion)', () => {
    // Cloud Logging benefits from grouping failures by identity
    // (model + prompt version), not just validation outcome.
    expect(FLOW_SRC).toMatch(/modelName:\s*STAMPED_MODEL_NAME\b/);
    expect(FLOW_SRC).toMatch(/promptVersion:\s*PROMPT_VERSION\b/);
  });

  it('warn payload carries both pass-error messages', () => {
    expect(FLOW_SRC).toMatch(/firstPassError:\s*parsed\.error\.message/);
    expect(FLOW_SRC).toMatch(/repairPassError:\s*repaired\.error\.message/);
  });

  it('warn payload carries wall-clock durationMs', () => {
    expect(FLOW_SRC).toMatch(
      /durationMs:\s*Date\.now\(\)\s*-\s*startedAtMs/,
    );
  });

  it('retries-counter on warn is fixed at 1', () => {
    expect(FLOW_SRC).toMatch(/retryCount:\s*1,/);
  });

  it('still throws a generic HttpsError after the warn', () => {
    expect(FLOW_SRC).toMatch(
      /HttpsError\(\s*['"]internal['"]\s*,\s*['"]AI returned an invalid plan after retry\.['"]/,
    );
  });
});
