/**
 * Curated ingredient substitution table.
 *
 * TS-as-data: each entry is a plain object literal so the TS compiler can
 * check aliases and `addedAllergens` against the existing `Allergen` enum
 * at build time. The async wrapper `substitutionService.getSubstitutions()`
 * is the single seam where a future Cloud Function can drop in to replace
 * this local table.
 *
 * Coverage targets the 80%: the items most often swapped by real cooks in
 * a weeknight-meal context — polarizing herbs, common allergens, dairy and
 * gluten pantry staples, and a handful of technique shifts (fresh garlic →
 * garlic powder, scallion → chive).
 *
 * MVP aliases map user-visible names ("green onion" / "spring onion") to
 * the canonical `original` so the dialog lights up regardless of how the
 * cook typed it.
 */

import type { Allergen } from '@/schemas/ingredient';

export type SubstitutionEntry = {
  /** Canonical normalized lookup key — must match `Ingredient.normalizedName` exactly. */
  original: string;
  /** User-typed variants that should resolve to this entry. */
  aliases?: string[];
  /** Display name of the suggested replacement. */
  replacement: string;
  /** Quantity multiplier — 1 means same qty, 0.125 means 1/8 as much (e.g. garlic powder). */
  ratio?: number;
  /** Optional cook-friendly note that shows in the modal. */
  note?: string;
  /** Allergens this replacement ADDS on top of the original's allergens. Triggers confirmation chip. */
  addedAllergens?: Allergen[];
};

const entry = <T extends SubstitutionEntry>(e: T): T => e;

export const SUBSTITUTIONS: SubstitutionEntry[] = [
  // Herbs — polarizing, the "I hate cilantro" classic.
  entry({
    original: 'cilantro',
    aliases: ['coriander leaves', 'fresh coriander'],
    replacement: 'flat-leaf parsley',
    ratio: 1,
    note: 'Lacks cilantro\u2019s citrus note. Add a few drops of lime if the dish depends on it.',
  }),
  entry({
    original: 'flat-leaf parsley',
    aliases: ['parsley', 'italian parsley'],
    replacement: 'cilantro',
    ratio: 1,
    note: 'Bright, slightly peppery. Best when the cook likes a herbaceous finish.',
  }),
  entry({
    original: 'basil',
    replacement: 'spinach',
    ratio: 1,
    note: 'Milder; finish with a squeeze of lemon to replicate basil\u2019s sweetness.',
  }),
  entry({
    original: 'thyme',
    aliases: ['fresh thyme'],
    replacement: 'oregano',
    ratio: 1,
    note: 'Italian-leaning swap. Stronger; reduce by half if using dried.',
  }),
  entry({
    original: 'rosemary',
    replacement: 'sage',
    ratio: 1,
    note: 'Both assertive. Sage is slightly sweeter and more autumnal.',
  }),

  // Aromatics — technique swaps.
  entry({
    original: 'garlic',
    aliases: ['garlic clove', 'fresh garlic'],
    replacement: 'garlic powder',
    ratio: 0.125,
    note: '\u2154 tsp powder per clove. Use only when fresh is unavailable.',
  }),
  entry({
    original: 'onion',
    aliases: ['yellow onion', 'white onion', 'red onion'],
    replacement: 'shallot',
    ratio: 2,
    note: 'Two shallots per small onion. Sweeter, cleaner in salads.',
  }),
  entry({
    original: 'shallot',
    replacement: 'onion',
    ratio: 0.5,
    note: 'Half a small yellow onion per shallot.',
  }),

  // Dairy — allergens + common swaps.
  entry({
    original: 'butter',
    aliases: ['unsalted butter'],
    replacement: 'olive oil',
    ratio: 0.75,
    note: '\u00be tbsp oil per 1 tbsp butter. Vegan; loses the browned-butter flavor.',
  }),
  entry({
    original: 'butter',
    replacement: 'coconut oil',
    ratio: 1,
    note: 'Solidified below 24 \u00b0C; slight coconut note.',
  }),
  entry({
    original: 'parmesan',
    aliases: ['parmigiano reggiano', 'parmesan cheese'],
    replacement: 'nutritional yeast',
    ratio: 1,
    note: 'Vegan. Savory, cheesy-adjacent; doesn\u2019t melt.',
  }),
  entry({
    original: 'milk',
    aliases: ['whole milk', 'cow milk'],
    replacement: 'oat milk',
    ratio: 1,
    note: 'Closest 1:1 swap. Mildly sweet; fine in creamy sauces.',
  }),
  entry({
    original: 'heavy cream',
    aliases: ['double cream'],
    replacement: 'coconut milk',
    ratio: 1,
    note: 'Full-fat. Slight coconut note; works in curries; less so in alfredo.',
  }),
  entry({
    original: 'yogurt',
    aliases: ['greek yogurt', 'plain yogurt'],
    replacement: 'sour cream',
    ratio: 1,
    note: 'Almost identical in cooked applications.',
  }),

  // Gluten — pantry.
  entry({
    original: 'flour',
    aliases: ['all-purpose flour', 'all purpose flour', 'wheat flour'],
    replacement: 'rolled oats',
    ratio: 1.6,
    note: 'Blend to a coarse flour first. For binding/thickening only \u2014 not for yeast breads.',
  }),
  entry({
    original: 'pasta',
    aliases: ['spaghetti', 'penne', 'rigatoni', 'linguine'],
    replacement: 'rice noodles',
    ratio: 1,
    note: 'Gluten-free. Cook 30 seconds less; rinse with cold water to stop.',
  }),
  entry({
    original: 'breadcrumbs',
    aliases: ['bread crumbs'],
    replacement: 'crushed cornflakes',
    ratio: 1,
    note: 'Gluten-free optional. Crush finer for a smoother crust.',
  }),

  // Eggs.
  entry({
    original: 'eggs',
    aliases: ['egg', 'large eggs'],
    replacement: 'flax egg',
    ratio: 1,
    note: '1 tbsp ground flax + 3 tbsp water per egg. Best in baked goods; not for frying.',
  }),
  entry({
    original: 'eggs',
    replacement: 'mashed banana',
    ratio: 0.25,
    note: '\u00bc cup mashed per egg. Adds sweetness; best in muffins/brownies.',
  }),

  // Proteins.
  entry({
    original: 'chicken thighs',
    aliases: ['chicken thigh', 'boneless chicken thighs'],
    replacement: 'chicken breasts',
    ratio: 1,
    note: 'Leaner. Add 5\u201310 minutes cook time and a splash of stock to keep moist.',
  }),
  entry({
    original: 'ground beef',
    aliases: ['minced beef', 'beef mince'],
    replacement: 'ground turkey',
    ratio: 1,
    note: 'Lighter. Add 1 tbsp olive oil to keep patties from drying out.',
  }),
  entry({
    original: 'tofu',
    aliases: ['firm tofu', 'extra firm tofu'],
    replacement: 'tempeh',
    ratio: 1,
    note: 'Nuttier; press first. Vegan.',
  }),
  entry({
    original: 'fish',
    aliases: ['white fish', 'salmon', 'cod'],
    replacement: 'jackfruit (young, green)',
    ratio: 1.4,
    note: 'Vegan fish-taco swap. Pull-apart texture after roasting.',
  }),

  // Condiments / pantry acids.
  entry({
    original: 'soy sauce',
    aliases: ['shoyu'],
    replacement: 'tamari',
    ratio: 1,
    note: 'Gluten-free soy. Identical umami.',
  }),
  entry({
    original: 'soy sauce',
    replacement: 'coconut aminos',
    ratio: 1,
    note: 'Sweeter, lower sodium. Gluten-free + soy-free.',
  }),
  entry({
    original: 'ketchup',
    replacement: 'tomato paste + vinegar + sugar',
    ratio: 0.5,
    note: '\u00bd paste + 1 tsp vinegar + 1 tsp sugar per 1 tbsp ketchup.',
  }),
  entry({
    original: 'lemon juice',
    aliases: ['lemon', 'fresh lemon juice'],
    replacement: 'lime juice',
    ratio: 1,
    note: '1:1. Slightly more floral; works in any recipe that calls for lemon.',
  }),

  // Sweets / baking.
  entry({
    original: 'sugar',
    aliases: ['white sugar', 'granulated sugar'],
    replacement: 'honey',
    ratio: 0.75,
    note: '\u00be cup honey per 1 cup sugar. Reduce other liquids by 3 tbsp.',
  }),
  entry({
    original: 'sugar',
    replacement: 'maple syrup',
    ratio: 0.75,
    note: '\u00be cup syrup per 1 cup sugar. Reduce other liquids by 3 tbsp.',
  }),
  entry({
    original: 'chocolate (dark)',
    aliases: ['dark chocolate', 'bittersweet chocolate'],
    replacement: 'cocoa powder + butter',
    ratio: 1,
    note: '1 oz chocolate = 3 tbsp cocoa + 1 tbsp butter.',
  }),
];
