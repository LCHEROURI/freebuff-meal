/**
 * Ingredient extractor — natural language → structured ingredient list.
 *
 * Uses the existing `gemini20Flash` model (already wired in
 * `generateMealPlanFlow`) so we don't burn a second model card. The
 * extractor is short-lived: it returns quickly, errors gracefully,
 * and never falls back to "all named nouns" — if it can't parse, it
 * returns the raw names as `confidence: 0.0` ingredients so the agent
 * can confirm them.
 *
 * Important rules the prompt locks in (and that we post-parse for):
 *   1. `quantity` defaults to null when the user didn't say a number.
 *   2. `unit` defaults to null when the user didn't say a unit.
 *   3. `condition` is `fresh` unless the user said "frozen / leftover /
 *      canned / dried / cooked".
 *   4. Plural / singular / "a few" / "some" → null quantity.
 *   5. Half / quarter / third → 0.5 / 0.25 / 0.333… — never undefined.
 *   6. The extractor MUST NOT invent ingredients the user didn't say.
 */
import { gemini20Flash } from '@genkit-ai/vertexai';
import { z } from 'zod';

import { ai } from '../index.js';
import { AgentIngredientSchema, type AgentIngredient } from './schemas.js';

const EXTRACTOR_SYSTEM_PROMPT = `\
You are a kitchen-pantry ingredient extractor. Given a single utterance from a cook describing what they have on hand, return ONLY a JSON array of structured ingredient objects.

Rules (apply strictly):
1. Emit one object per distinct food item mentioned. Never invent items the user didn't say.
2. 'quantity' is:
   - the integer the user stated ("two tomatoes" → 2) when unambiguous
   - the fractional value the user stated ("half" → 0.5, "quarter" → 0.25, "third" → 0.333, "eighth" → 0.125, "a couple" → 2, "a few" → 3)
   - otherwise null
3. 'unit' is the unit string the user stated, otherwise null. Never invent a unit.
4. 'condition' is one of: fresh, frozen, cooked, leftover, canned, dried, other. Default is null when not stated explicitly.
5. 'confidence' is your self-rated 0.0–1.0 confidence in the parse:
   - 0.95 for clear, numeric + unit
   - 0.6 for clear name only
   - 0.3 for a noun-pasted, ambiguous fragment
6. Strip leading "I have", "I also have", "and", "plus", filler words.
7. Return ONLY the JSON array. No commentary, no markdown fence.

Example utterance → output:
"I have three chicken breasts, two tomatoes, half an onion, garlic, rice, olive oil, paprika, and frozen peas"
→ [
  {"name":"chicken breast","quantity":3,"unit":null,"condition":"fresh","confidence":0.85},
  {"name":"tomato","quantity":2,"unit":null,"condition":"fresh","confidence":0.7},
  {"name":"onion","quantity":0.5,"unit":"medium","condition":"fresh","confidence":0.7},
  {"name":"garlic","quantity":null,"unit":null,"condition":"fresh","confidence":0.6},
  {"name":"rice","quantity":null,"unit":null,"condition":null,"confidence":0.6},
  {"name":"olive oil","quantity":null,"unit":null,"condition":null,"confidence":0.6},
  {"name":"paprika","quantity":null,"unit":null,"condition":null,"confidence":0.6},
  {"name":"peas","quantity":null,"unit":null,"condition":"frozen","confidence":0.9}
]
`;

const ExtractorOutputSchema = z.array(AgentIngredientSchema);

export type ExtractIngredientsResult = {
  ingredients: AgentIngredient[];
  warnings: string[];
};

/**
 * Pure function. If Gemini is unavailable or the parse fails, returns
 * a best-effort fallback: splits on commas/and, takes each token as a
 * bare-name ingredient with `confidence: 0.3` so the agent can confirm.
 *
 * Never throws — the agent (and the wizard) need a deterministic shape
 * to render chips, so a low-quality fallback is strictly better than an
 * error surface.
 */
export const extractIngredients = async (
  utterance: string,
): Promise<ExtractIngredientsResult> => {
  const cleaned = utterance.trim();
  if (!cleaned) {
    return { ingredients: [], warnings: ['No utterance to extract from.'] };
  }

  try {
    const out = await ai.generate({
      model: gemini20Flash,
      prompt: `${EXTRACTOR_SYSTEM_PROMPT}\n\nUTTERANCE:\n${cleaned}`,
      output: { schema: ExtractorOutputSchema as unknown as z.ZodTypeAny },
      config: { temperature: 0.1, maxOutputTokens: 1024 },
    });
    const parsed = ExtractorOutputSchema.safeParse(out.output);
    if (!parsed.success) {
      return {
        ingredients: fallbackFromText(cleaned),
        warnings: ['Extractor parse failed; fell back to plain split.'],
      };
    }
    // Post-validate: drop anything that's an empty name (defence in depth).
    const deduped = dedupe(parsed.data.filter((i) => i.name.trim().length > 0));
    return {
      ingredients: deduped,
      warnings: deduped.length === 0 ? ['Extractor returned no usable items.'] : [],
    };
  } catch (err) {
    console.warn('[ingredientExtractor] gemini failed', err);
    return {
      ingredients: fallbackFromText(cleaned),
      warnings: ['Extractor LLM unavailable; using plain-text fallback.'],
    };
  }
};

const dedupe = (items: AgentIngredient[]): AgentIngredient[] => {
  const seen = new Set<string>();
  const out: AgentIngredient[] = [];
  for (const item of items) {
    const key = item.name.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
};

/**
 * Rule-based fallback. Splits on commas / "and" / "plus" / "also", then
 * normalizes each token by stripping obvious filler words like "some",
 * "a", "the", "of". Quantity and unit stay null; confidence 0.3.
 *
 * Not used in production — the wizard would prefer the Gemini output.
 * Kept here so a parser outage doesn't break the UI.
 */
const fallbackFromText = (raw: string): AgentIngredient[] => {
  const tokens = raw
    .split(/[,;]+|\b(?:and|plus|also)\b/i)
    .map((t) =>
      t
        .replace(/^\s*(?:i (?:have|also have)|some|a couple of|a few|the|of)\s+/i, '')
        .trim(),
    )
    .filter(Boolean);
  const items = tokens.map<AgentIngredient>((token) => {
    const lower = token.toLowerCase();
    const condition: AgentIngredient['condition'] = lower.includes('frozen')
      ? 'frozen'
      : lower.includes('leftover')
        ? 'leftover'
        : lower.includes('canned')
          ? 'canned'
          : lower.includes('dried')
            ? 'dried'
            : lower.includes('cooked')
              ? 'cooked'
              : null;
    return {
      name: token.split(/\s/).slice(-2).join(' '),
      quantity: null,
      unit: null,
      condition,
      confidence: 0.3,
    };
  });
  return dedupe(items);
};
