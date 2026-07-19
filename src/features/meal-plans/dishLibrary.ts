/**
 * Recognizable dish library.
 *
 * In production, the AI flow uses Vertex AI Gemini (see functions/src/ai).
 * In demo mode, we synthesize a plan deterministically from this curated
 * library so the UI is fully walkable without external credentials.
 *
 * Each dish is verified by a quick readability pass (recognizable, named,
 * units consistent) — replace with Vertex results when deployed.
 */
import type { Ingredient, Recipe } from '@/schemas';
import type { MealPlanGenerationInput } from '@/schemas/mealPlan';

const allergenForTag = (tag: string): Ingredient['allergenFlags'][number] | null => {
  switch (tag) {
    case 'gluten':
    case 'wheat':
      return 'wheat';
    case 'dairy':
      return 'dairy';
    case 'eggs':
      return 'eggs';
    case 'soy':
      return 'soy';
    case 'fish':
      return 'fish';
    case 'shellfish':
      return 'shellfish';
    case 'peanuts':
      return 'peanuts';
    case 'tree_nuts':
      return 'tree_nuts';
    case 'sesame':
      return 'sesame';
    default:
      return null;
  }
};

const ing = (
  name: string,
  quantity: number,
  unit: Ingredient['unit'],
  category: Ingredient['category'],
  tags: string[] = [],
  options: Partial<Ingredient> = {},
): Ingredient => {
  const allergens = tags.map(allergenForTag).filter(Boolean) as Ingredient['allergenFlags'];
  return {
    name,
    normalizedName: name.toLowerCase(),
    quantity,
    unit,
    category,
    displayText: `${quantity} ${unit} ${name}`,
    isOptional: false,
    isPantryItem: false,
    allergenFlags: allergens,
    ...options,
  };
};

export const DISH_LIBRARY: Recipe[] = [
  {
    id: 'chicken-piccata',
    name: 'Chicken Piccata',
    shortDescription: 'Pan-seared cutlets in a bright lemon-caper sauce.',
    cuisine: 'Italian',
    originCountry: 'Italy',
    originCountryCode: 'IT',
    dishClassification: 'main',
    authenticityLabel: 'widely_recognized',
    whyItFits: 'Classic 30-minute Italian weeknight staple with pantry ingredients.',
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    totalTimeMinutes: 30,
    servings: 2,
    difficulty: 'easy',
    equipment: ['Large skillet'],
    ingredients: [
      ing('Chicken cutlets', 2, 'piece', 'meat_seafood'),
      ing('Flour', 30, 'g', 'pantry', ['gluten'], { isPantryItem: true }),
      ing('Olive oil', 2, 'tbsp', 'pantry', [], { isPantryItem: true }),
      ing('Butter', 30, 'g', 'dairy_refrigerated', ['dairy']),
      ing('Lemon juice', 2, 'tbsp', 'produce'),
      ing('Capers', 1, 'tbsp', 'pantry'),
      ing('Parsley', 1, 'bunch', 'produce', [], { isOptional: true }),
      ing('Salt', 1, 'pinch', 'spices_seasonings', [], { isPantryItem: true }),
      ing('Black pepper', 1, 'pinch', 'spices_seasonings', [], { isPantryItem: true }),
    ],
    preparationSteps: [
      {
        order: 1,
        phase: 'preparation',
        text: 'Pound chicken cutlets to even 1 cm thickness; pat dry and season.',
      },
      {
        order: 2,
        phase: 'preparation',
        text: 'Spread flour on a plate and dredge both sides of each cutlet, shaking off excess.',
      },
      {
        order: 3,
        phase: 'preparation',
        text: 'Mince parsley and reserve a tablespoon for finishing.',
      },
    ],
    cookingSteps: [
      {
        order: 1,
        phase: 'cooking',
        text: 'Heat olive oil and 15 g butter in a skillet over medium-high heat.',
      },
      {
        order: 2,
        phase: 'cooking',
        text: 'Sear cutlets ~3 minutes per side until golden; transfer to a plate.',
      },
      {
        order: 3,
        phase: 'cooking',
        text: 'Add lemon juice and capers to the pan; simmer 1 minute, scraping the fond.',
      },
      {
        order: 4,
        phase: 'cooking',
        text: 'Whisk in remaining butter; return chicken to pan to coat in sauce.',
      },
    ],
    presentationSuggestions: [
      'Slice cutlets on the bias, spoon sauce over, and finish with parsley.',
    ],
    substitutions: [
      { original: 'Capers', replacement: 'Green olives, chopped', note: 'Less briny.' },
    ],
    leftoverInstructions:
      'Refrigerate up to 2 days. Reheat in a covered skillet with a splash of water.',
    foodSafetyNotes: ['Cook chicken to 74 °C / 165 °F internal temperature.'],
    allergenFlags: ['wheat', 'dairy'],
    dietaryTags: ['none'],
    sideDishSuggestion: {
      name: 'Buttered linguine or steamed greens',
      why: 'Catches the bright pan sauce.',
    },
    source: 'demo',
  },
  {
    id: 'pasta-primavera',
    name: 'Pasta Primavera',
    shortDescription: 'Spring vegetables tossed with pasta and a light herb sauce.',
    cuisine: 'Italian',
    originCountry: 'Italy',
    originCountryCode: 'IT',
    dishClassification: 'pasta',
    authenticityLabel: 'common_variation',
    whyItFits: 'Flexible, fast, and a great way to use vegetables on hand.',
    prepTimeMinutes: 12,
    cookTimeMinutes: 18,
    totalTimeMinutes: 30,
    servings: 2,
    difficulty: 'easy',
    equipment: ['Large pot', 'Large skillet'],
    ingredients: [
      ing('Pasta', 200, 'g', 'pantry', ['gluten'], { isPantryItem: true }),
      ing('Zucchini', 1, 'piece', 'produce'),
      ing('Cherry tomatoes', 200, 'g', 'produce'),
      ing('Bell pepper', 1, 'piece', 'produce'),
      ing('Garlic', 2, 'clove', 'produce'),
      ing('Olive oil', 3, 'tbsp', 'pantry', [], { isPantryItem: true }),
      ing('Lemon zest', 1, 'piece', 'produce'),
      ing('Parmesan', 30, 'g', 'dairy_refrigerated', ['dairy'], { isOptional: true }),
      ing('Basil', 1, 'bunch', 'produce', [], { isOptional: true }),
      ing('Salt', 1, 'pinch', 'spices_seasonings', [], { isPantryItem: true }),
    ],
    preparationSteps: [
      {
        order: 1,
        phase: 'preparation',
        text: 'Cut zucchini and bell pepper into thin strips; halve cherry tomatoes; mince garlic.',
      },
      {
        order: 2,
        phase: 'preparation',
        text: 'Bring a large pot of salted water to a boil.',
      },
    ],
    cookingSteps: [
      {
        order: 1,
        phase: 'cooking',
        text: 'Cook pasta to al dente per package directions; reserve 1 cup of pasta water.',
      },
      {
        order: 2,
        phase: 'cooking',
        text: 'In a large skillet, sauté zucchini and pepper in olive oil over high heat for 4 minutes.',
      },
      {
        order: 3,
        phase: 'cooking',
        text: 'Add garlic and tomatoes; cook another 2 minutes until tomatoes soften.',
      },
      {
        order: 4,
        phase: 'cooking',
        text: 'Toss pasta and 1/2 cup pasta water with vegetables; finish with lemon zest and basil.',
      },
    ],
    presentationSuggestions: [
      'Serve in wide bowls; shower with parmesan if using.',
    ],
    substitutions: [
      { original: 'Parmesan', replacement: 'Nutritional yeast', note: 'For dairy-free diets.' },
    ],
    leftoverInstructions:
      'Best fresh; refrigerated leftovers keep 1 day. Add a splash of water when reheating.',
    foodSafetyNotes: [],
    allergenFlags: ['wheat', 'dairy'],
    dietaryTags: ['vegetarian'],
    sideDishSuggestion: { name: 'Crusty bread', why: 'Soaks up the herb oil.' },
    source: 'demo',
  },
  {
    id: 'greek-lemon-chicken',
    name: 'Greek Lemon Chicken',
    shortDescription: 'Sheet-pan chicken thighs with lemon, potatoes, and oregano.',
    cuisine: 'Greek',
    originCountry: 'Greece',
    originCountryCode: 'GR',
    dishClassification: 'main',
    authenticityLabel: 'traditional',
    whyItFits: 'One-pan weeknight classic with bold Mediterranean flavors.',
    prepTimeMinutes: 10,
    cookTimeMinutes: 35,
    totalTimeMinutes: 45,
    servings: 4,
    difficulty: 'easy',
    equipment: ['Sheet pan', 'Oven'],
    ingredients: [
      ing('Chicken thighs', 6, 'piece', 'meat_seafood'),
      ing('Baby potatoes', 500, 'g', 'produce'),
      ing('Lemon', 2, 'piece', 'produce'),
      ing('Garlic', 4, 'clove', 'produce'),
      ing('Olive oil', 4, 'tbsp', 'pantry', [], { isPantryItem: true }),
      ing('Oregano', 1, 'tbsp', 'spices_seasonings', [], { isPantryItem: true }),
      ing('Salt', 1, 'pinch', 'spices_seasonings', [], { isPantryItem: true }),
      ing('Black pepper', 1, 'pinch', 'spices_seasonings', [], { isPantryItem: true }),
    ],
    preparationSteps: [
      {
        order: 1,
        phase: 'preparation',
        text: 'Halve baby potatoes; mince garlic; slice lemon into rounds.',
      },
      {
        order: 2,
        phase: 'preparation',
        text: 'Whisk olive oil, oregano, lemon juice of one lemon, garlic, salt, and pepper.',
      },
    ],
    cookingSteps: [
      {
        order: 1,
        phase: 'cooking',
        text: 'Heat oven to 220 °C / 425 °F.',
      },
      {
        order: 2,
        phase: 'cooking',
        text: 'Toss chicken and potatoes with the marinade on a sheet pan.',
      },
      {
        order: 3,
        phase: 'cooking',
        text: 'Roast 30–35 minutes, turning halfway, until chicken is 74 °C and potatoes are tender.',
      },
    ],
    presentationSuggestions: ['Squeeze remaining lemon over just before serving.'],
    substitutions: [
      { original: 'Chicken thighs', replacement: 'Bone-in chicken breasts', note: 'Add 10 minutes cook time.' },
    ],
    leftoverInstructions: 'Refrigerate up to 3 days. Reheat at 180 °C for 10 minutes.',
    foodSafetyNotes: ['Cook chicken to 74 °C / 165 °F.'],
    allergenFlags: [],
    dietaryTags: ['gluten_free', 'dairy_free'],
    sideDishSuggestion: { name: 'Greek salad', why: 'Echoes the Mediterranean flavors.' },
    source: 'demo',
  },
  {
    id: 'nasi-goreng',
    name: 'Indonesian Nasi Goreng',
    shortDescription: 'Fragrant fried rice with kecap manis, chili, and a fried egg.',
    cuisine: 'Indonesian',
    originCountry: 'Indonesia',
    originCountryCode: 'ID',
    dishClassification: 'rice',
    authenticityLabel: 'widely_recognized',
    whyItFits: 'A brilliant way to use leftover rice in under 30 minutes.',
    prepTimeMinutes: 10,
    cookTimeMinutes: 15,
    totalTimeMinutes: 25,
    servings: 2,
    difficulty: 'medium',
    equipment: ['Wok or large skillet'],
    ingredients: [
      ing('Cooked jasmine rice (cold)', 400, 'g', 'pantry'),
      ing('Chicken breast', 200, 'g', 'meat_seafood'),
      ing('Eggs', 2, 'piece', 'dairy_refrigerated', ['eggs']),
      ing('Shallot', 2, 'piece', 'produce'),
      ing('Garlic', 2, 'clove', 'produce'),
      ing('Kecap manis', 2, 'tbsp', 'pantry'),
      ing('Sambal oelek', 1, 'tsp', 'pantry', [], { isOptional: true }),
      ing('Vegetable oil', 2, 'tbsp', 'pantry', [], { isPantryItem: true }),
      ing('Cucumber', 1, 'piece', 'produce'),
      ing('Salt', 1, 'pinch', 'spices_seasonings', [], { isPantryItem: true }),
    ],
    preparationSteps: [
      {
        order: 1,
        phase: 'preparation',
        text: 'Mince garlic and shallot; dice chicken; slice cucumber for serving.',
      },
    ],
    cookingSteps: [
      {
        order: 1,
        phase: 'cooking',
        text: 'Heat oil in a wok over high heat; fry shallot and garlic 30 seconds.',
      },
      {
        order: 2,
        phase: 'cooking',
        text: 'Add chicken; stir-fry 4 minutes until just cooked.',
      },
      {
        order: 3,
        phase: 'cooking',
        text: 'Add rice, kecap manis, and sambal; toss until rice is heated through and slightly caramelized.',
      },
      {
        order: 4,
        phase: 'cooking',
        text: 'Push rice aside; crack in eggs and scramble briefly, then mix through.',
      },
    ],
    presentationSuggestions: ['Top with cucumber slices and extra sambal.'],
    substitutions: [
      { original: 'Kecap manis', replacement: 'Soy sauce + 1 tsp brown sugar', note: 'Approximate sweetness.' },
    ],
    leftoverInstructions: 'Refrigerate up to 2 days; refresh in a hot wok with a splash of oil.',
    foodSafetyNotes: ['Cook chicken to 74 °C / 165 °F.'],
    allergenFlags: ['eggs', 'soy'],
    dietaryTags: ['dairy_free'],
    sideDishSuggestion: { name: 'Cucumber salad', why: 'Cool, crunchy contrast.' },
    source: 'demo',
  },
  {
    id: 'chicken-tagine',
    name: 'Moroccan Chicken Tagine',
    shortDescription: 'Slow-braised chicken with preserved lemon, olives, and warm spices.',
    cuisine: 'Moroccan',
    originCountry: 'Morocco',
    originCountryCode: 'MA',
    dishClassification: 'stew',
    authenticityLabel: 'widely_recognized',
    whyItFits: 'Weeknight-adapted: a pressure cooker brings the tagine home in 40 minutes.',
    prepTimeMinutes: 10,
    cookTimeMinutes: 30,
    totalTimeMinutes: 40,
    servings: 4,
    difficulty: 'medium',
    equipment: ['Pressure cooker or Dutch oven'],
    ingredients: [
      ing('Chicken thighs', 6, 'piece', 'meat_seafood'),
      ing('Onion', 1, 'piece', 'produce'),
      ing('Carrots', 2, 'piece', 'produce'),
      ing('Preserved lemon', 0.5, 'piece', 'pantry'),
      ing('Green olives', 100, 'g', 'pantry'),
      ing('Cumin', 1, 'tsp', 'spices_seasonings', [], { isPantryItem: true }),
      ing('Ginger', 1, 'tsp', 'spices_seasonings', [], { isPantryItem: true }),
      ing('Cinnamon', 0.5, 'tsp', 'spices_seasonings', [], { isPantryItem: true }),
      ing('Chicken stock', 250, 'ml', 'pantry'),
      ing('Olive oil', 2, 'tbsp', 'pantry', [], { isPantryItem: true }),
      ing('Cilantro', 1, 'bunch', 'produce', [], { isOptional: true }),
    ],
    preparationSteps: [
      {
        order: 1,
        phase: 'preparation',
        text: 'Slice onion; peel and cut carrots; chop preserved lemon flesh.',
      },
    ],
    cookingSteps: [
      {
        order: 1,
        phase: 'cooking',
        text: 'Sear seasoned chicken in olive oil until golden; set aside.',
      },
      {
        order: 2,
        phase: 'cooking',
        text: 'Sauté onion and spices 3 minutes; add carrots and stock; scrape the fond.',
      },
      {
        order: 3,
        phase: 'cooking',
        text: 'Return chicken, preserved lemon, and olives. Pressure-cook 15 minutes.',
      },
      {
        order: 4,
        phase: 'cooking',
        text: 'Release pressure, finish with cilantro, and adjust seasoning.',
      },
    ],
    presentationSuggestions: ['Serve over couscous with cilantro on top.'],
    substitutions: [
      { original: 'Preserved lemon', replacement: 'Lemon zest + 1/2 tsp salt', note: 'Less nuanced but acceptable.' },
    ],
    leftoverInstructions:
      'Flavors deepen overnight. Refrigerate up to 3 days; reheat gently with a splash of water.',
    foodSafetyNotes: ['Cook chicken to 74 °C / 165 °F.'],
    allergenFlags: [],
    dietaryTags: ['dairy_free', 'gluten_free'],
    sideDishSuggestion: { name: 'Couscous or crusty bread', why: 'Catches the sauce.' },
    source: 'demo',
  },
  {
    id: 'chicken-tinga',
    name: 'Chicken Tinga Tacos',
    shortDescription: 'Shredded chicken in a smoky tomato-chipotle sauce.',
    cuisine: 'Mexican',
    originCountry: 'Mexico',
    originCountryCode: 'MX',
    dishClassification: 'main',
    authenticityLabel: 'widely_recognized',
    whyItFits: 'A flexible weeknight favorite; doubles well as leftovers.',
    prepTimeMinutes: 10,
    cookTimeMinutes: 30,
    totalTimeMinutes: 40,
    servings: 4,
    difficulty: 'medium',
    equipment: ['Large skillet'],
    ingredients: [
      ing('Chicken thighs', 4, 'piece', 'meat_seafood'),
      ing('Tomatoes', 4, 'piece', 'produce'),
      ing('White onion', 1, 'piece', 'produce'),
      ing('Chipotle in adobo', 2, 'piece', 'pantry'),
      ing('Garlic', 3, 'clove', 'produce'),
      ing('Cumin', 1, 'tsp', 'spices_seasonings', [], { isPantryItem: true }),
      ing('Oregano', 0.5, 'tsp', 'spices_seasonings', [], { isPantryItem: true }),
      ing('Corn tortillas', 8, 'piece', 'bakery'),
      ing('Avocado', 2, 'piece', 'produce'),
      ing('Lime', 1, 'piece', 'produce'),
      ing('Cilantro', 1, 'bunch', 'produce'),
      ing('Olive oil', 1, 'tbsp', 'pantry', [], { isPantryItem: true }),
    ],
    preparationSteps: [
      {
        order: 1,
        phase: 'preparation',
        text: 'Halve tomatoes and onion; mince garlic; seed chipotles.',
      },
    ],
    cookingSteps: [
      {
        order: 1,
        phase: 'cooking',
        text: 'Simmer chicken in water with half the onion and garlic until cooked through (~20 min).',
      },
      {
        order: 2,
        phase: 'cooking',
        text: 'Shred chicken. Blend tomatoes, remaining onion, garlic, chipotles, and spices.',
      },
      {
        order: 3,
        phase: 'cooking',
        text: 'Sauté sauce in oil 8 minutes; add chicken and simmer 5 minutes more.',
      },
    ],
    presentationSuggestions: ['Serve in warm tortillas with avocado, lime, and cilantro.'],
    substitutions: [{ original: 'Chipotle in adobo', replacement: '1 tsp smoked paprika + pinch cayenne' }],
    leftoverInstructions: 'Sauce improves overnight. Refrigerate up to 3 days.',
    foodSafetyNotes: ['Cook chicken to 74 °C / 165 °F.'],
    allergenFlags: [],
    dietaryTags: ['dairy_free', 'gluten_free'],
    sideDishSuggestion: { name: 'Charred corn', why: 'Sweet counterpoint.' },
    source: 'demo',
  },
  {
    id: 'ratatouille',
    name: 'Ratatouille',
    shortDescription: 'Provençal stew of eggplant, zucchini, peppers, and tomato.',
    cuisine: 'French',
    originCountry: 'France',
    originCountryCode: 'FR',
    dishClassification: 'stew',
    authenticityLabel: 'traditional',
    whyItFits: 'Veg-forward weeknight dinner that improves as leftovers.',
    prepTimeMinutes: 15,
    cookTimeMinutes: 35,
    totalTimeMinutes: 50,
    servings: 4,
    difficulty: 'medium',
    equipment: ['Large heavy pan'],
    ingredients: [
      ing('Eggplant', 1, 'piece', 'produce'),
      ing('Zucchini', 2, 'piece', 'produce'),
      ing('Bell pepper', 2, 'piece', 'produce'),
      ing('Tomatoes', 4, 'piece', 'produce'),
      ing('Onion', 1, 'piece', 'produce'),
      ing('Garlic', 3, 'clove', 'produce'),
      ing('Olive oil', 4, 'tbsp', 'pantry', [], { isPantryItem: true }),
      ing('Thyme', 1, 'tsp', 'spices_seasonings', [], { isPantryItem: true }),
      ing('Basil', 1, 'bunch', 'produce', [], { isOptional: true }),
      ing('Salt', 1, 'pinch', 'spices_seasonings', [], { isPantryItem: true }),
    ],
    preparationSteps: [
      {
        order: 1,
        phase: 'preparation',
        text: 'Cut eggplant, zucchini, pepper, and tomatoes into 2 cm cubes; mince onion and garlic.',
      },
    ],
    cookingSteps: [
      {
        order: 1,
        phase: 'cooking',
        text: 'Heat oil in a heavy pan over medium heat; sauté onion and garlic until soft.',
      },
      {
        order: 2,
        phase: 'cooking',
        text: 'Add eggplant and pepper; cook 10 minutes until they begin to soften.',
      },
      {
        order: 3,
        phase: 'cooking',
        text: 'Add zucchini, tomatoes, thyme; simmer 20 minutes uncovered.',
      },
      {
        order: 4,
        phase: 'cooking',
        text: 'Finish with basil; adjust salt.',
      },
    ],
    presentationSuggestions: ['Serve at room temperature with crusty bread or rice.'],
    substitutions: [],
    leftoverInstructions: 'Refrigerate up to 4 days; flavors deepen.',
    foodSafetyNotes: [],
    allergenFlags: [],
    dietaryTags: ['vegan', 'gluten_free', 'dairy_free'],
    sideDishSuggestion: { name: 'Crusty baguette', why: 'For mopping.' },
    source: 'demo',
  },
  {
    id: 'oyakodon',
    name: 'Oyakodon',
    shortDescription: 'Japanese chicken and egg rice bowl.',
    cuisine: 'Japanese',
    originCountry: 'Japan',
    originCountryCode: 'JP',
    dishClassification: 'rice',
    authenticityLabel: 'traditional',
    whyItFits: '20-minute weeknight dinner, pantry-friendly.',
    prepTimeMinutes: 5,
    cookTimeMinutes: 15,
    totalTimeMinutes: 20,
    servings: 2,
    difficulty: 'easy',
    equipment: ['Small skillet'],
    ingredients: [
      ing('Chicken thighs', 300, 'g', 'meat_seafood'),
      ing('Eggs', 4, 'piece', 'dairy_refrigerated', ['eggs']),
      ing('Onion', 0.5, 'piece', 'produce'),
      ing('Soy sauce', 3, 'tbsp', 'pantry', ['soy'], { isPantryItem: true }),
      ing('Mirin', 2, 'tbsp', 'pantry', [], { isPantryItem: true }),
      ing('Dashi', 100, 'ml', 'pantry'),
      ing('Steamed rice', 400, 'g', 'pantry'),
      ing('Scallion', 1, 'bunch', 'produce', [], { isOptional: true }),
    ],
    preparationSteps: [
      {
        order: 1,
        phase: 'preparation',
        text: 'Slice onion thinly; cut chicken into bite-size pieces; beat eggs lightly.',
      },
    ],
    cookingSteps: [
      {
        order: 1,
        phase: 'cooking',
        text: 'Combine soy, mirin, and dashi in a skillet; bring to a simmer.',
      },
      {
        order: 2,
        phase: 'cooking',
        text: 'Add onion and chicken; simmer 5 minutes until chicken is cooked.',
      },
      {
        order: 3,
        phase: 'cooking',
        text: 'Pour eggs over the top; cover 1–2 minutes until eggs are just set.',
      },
    ],
    presentationSuggestions: ['Spoon over steamed rice; finish with scallion.'],
    substitutions: [
      { original: 'Mirin', replacement: '1 tbsp sugar + 1 tbsp rice vinegar', note: 'Approximate sweetness.' },
    ],
    leftoverInstructions: 'Best fresh; refrigerate up to 1 day and reheat gently.',
    foodSafetyNotes: [
      'Use pasteurized eggs if concerned about gentle-set yolks.',
    ],
    allergenFlags: ['eggs', 'soy'],
    dietaryTags: ['dairy_free'],
    sideDishSuggestion: { name: 'Quick cucumber sunomono', why: 'Bright acidic balance.' },
    source: 'demo',
  },
  {
    id: 'chana-masala',
    name: 'Chana Masala',
    shortDescription: 'Spiced chickpeas in a tangy tomato-onion gravy.',
    cuisine: 'Indian',
    originCountry: 'India',
    originCountryCode: 'IN',
    dishClassification: 'stew',
    authenticityLabel: 'widely_recognized',
    whyItFits: 'Pantry-friendly vegetarian weeknight workhorse.',
    prepTimeMinutes: 10,
    cookTimeMinutes: 25,
    totalTimeMinutes: 35,
    servings: 4,
    difficulty: 'easy',
    equipment: ['Large skillet'],
    ingredients: [
      ing('Chickpeas (cooked)', 500, 'g', 'pantry'),
      ing('Onion', 1, 'piece', 'produce'),
      ing('Tomatoes', 3, 'piece', 'produce'),
      ing('Garlic', 3, 'clove', 'produce'),
      ing('Ginger', 1, 'tbsp', 'produce'),
      ing('Garam masala', 1, 'tbsp', 'spices_seasonings', [], { isPantryItem: true }),
      ing('Cumin', 1, 'tsp', 'spices_seasonings', [], { isPantryItem: true }),
      ing('Coriander', 1, 'tsp', 'spices_seasonings', [], { isPantryItem: true }),
      ing('Turmeric', 0.5, 'tsp', 'spices_seasonings', [], { isPantryItem: true }),
      ing('Lemon', 1, 'piece', 'produce'),
      ing('Olive oil', 2, 'tbsp', 'pantry', [], { isPantryItem: true }),
      ing('Cilantro', 1, 'bunch', 'produce', [], { isOptional: true }),
    ],
    preparationSteps: [
      {
        order: 1,
        phase: 'preparation',
        text: 'Dice onion; mince garlic and ginger; chop tomatoes.',
      },
    ],
    cookingSteps: [
      {
        order: 1,
        phase: 'cooking',
        text: 'Sauté onion in oil 5 minutes until translucent; add garlic, ginger, and spices.',
      },
      {
        order: 2,
        phase: 'cooking',
        text: 'Add tomatoes; cook 8 minutes until softened and oil splits.',
      },
      {
        order: 3,
        phase: 'cooking',
        text: 'Add chickpeas and 100 ml water; simmer 10 minutes.',
      },
      {
        order: 4,
        phase: 'cooking',
        text: 'Squeeze in lemon, top with cilantro.',
      },
    ],
    presentationSuggestions: ['Serve with rice or warm flatbread.'],
    substitutions: [],
    leftoverInstructions: 'Flavors deepen overnight. Refrigerate up to 4 days.',
    foodSafetyNotes: [],
    allergenFlags: [],
    dietaryTags: ['vegetarian', 'vegan', 'gluten_free', 'dairy_free'],
    sideDishSuggestion: { name: 'Basmati rice', why: 'Classic pairing.' },
    source: 'demo',
  },
  {
    id: 'turkey-meatloaf',
    name: 'American Turkey Meatloaf',
    shortDescription: 'Comforting turkey meatloaf with a tangy glaze.',
    cuisine: 'American',
    originCountry: 'United States',
    originCountryCode: 'US',
    dishClassification: 'main',
    authenticityLabel: 'widely_recognized',
    whyItFits: 'Lighter weeknight classic that doubles for sandwiches.',
    prepTimeMinutes: 15,
    cookTimeMinutes: 45,
    totalTimeMinutes: 60,
    servings: 4,
    difficulty: 'easy',
    equipment: ['Sheet pan or loaf pan', 'Oven'],
    ingredients: [
      ing('Ground turkey', 500, 'g', 'meat_seafood'),
      ing('Breadcrumbs', 50, 'g', 'pantry', ['gluten'], { isPantryItem: true }),
      ing('Eggs', 1, 'piece', 'dairy_refrigerated', ['eggs']),
      ing('Onion', 1, 'piece', 'produce'),
      ing('Garlic', 2, 'clove', 'produce'),
      ing('Milk', 60, 'ml', 'dairy_refrigerated', ['dairy']),
      ing('Ketchup', 3, 'tbsp', 'pantry'),
      ing('Worcestershire sauce', 1, 'tbsp', 'pantry', ['fish']),
      ing('Salt', 1, 'pinch', 'spices_seasonings', [], { isPantryItem: true }),
      ing('Black pepper', 1, 'pinch', 'spices_seasonings', [], { isPantryItem: true }),
    ],
    preparationSteps: [
      {
        order: 1,
        phase: 'preparation',
        text: 'Mince onion and garlic; whisk milk and egg.',
      },
      {
        order: 2,
        phase: 'preparation',
        text: 'Heat oven to 190 °C / 375 °F.',
      },
    ],
    cookingSteps: [
      {
        order: 1,
        phase: 'cooking',
        text: 'Combine all ingredients except half the ketchup in a bowl; mix gently.',
      },
      {
        order: 2,
        phase: 'cooking',
        text: 'Form into a loaf on a sheet pan; spread remaining ketchup on top.',
      },
      {
        order: 3,
        phase: 'cooking',
        text: 'Bake 40–45 minutes to 74 °C internal.',
      },
    ],
    presentationSuggestions: ['Let rest 5 minutes before slicing.'],
    substitutions: [
      { original: 'Breadcrumbs', replacement: 'Rolled oats', note: 'Gluten-free option.' },
    ],
    leftoverInstructions: 'Refrigerate up to 3 days. Slice for sandwiches; great cold or hot.',
    foodSafetyNotes: ['Cook turkey to 74 °C / 165 °F.'],
    allergenFlags: ['gluten', 'eggs', 'dairy', 'fish'],
    dietaryTags: [],
    sideDishSuggestion: { name: 'Mashed potatoes', why: 'Classic comfort pairing.' },
    source: 'demo',
  },
];

const matchesAllergens = (
  recipe: Recipe,
  allergens: readonly string[] | undefined,
): boolean => {
  const list = allergens ?? [];
  return (
    list.length === 0 ||
    list.every((a) => !recipe.allergenFlags.includes(a as Recipe['allergenFlags'][number]))
  );
};

const matchesCuisine = (
  recipe: Recipe,
  cuisines: readonly string[] | undefined,
): boolean => {
  const list = cuisines ?? [];
  return (
    list.length === 0 || list.some((c) => recipe.cuisine.toLowerCase().includes(c.toLowerCase()))
  );
};

const matchesProtein = (
  recipe: Recipe,
  prefer: readonly string[] | undefined,
): boolean => {
  const list = prefer ?? [];
  if (list.length === 0) return true;
  const haystack = recipe.ingredients.map((i) => i.name.toLowerCase()).join(' ');
  return list.some((p) => haystack.includes(p.toLowerCase()));
};

const excludedDish = (
  recipe: Recipe,
  excluded: readonly string[] | undefined,
): boolean => {
  const list = excluded ?? [];
  return (
    list.length === 0 ||
    !recipe.ingredients.some((i) =>
      list.some((ex) => i.name.toLowerCase().includes(ex.toLowerCase())),
    )
  );
};

const withinTime = (recipe: Recipe, maxMinutes: number | undefined): boolean =>
  recipe.totalTimeMinutes <= (maxMinutes ?? 60) + 5;

/**
 * Deterministic fallback used when Vertex AI isn't configured. Returns
 * up to `planLength` recipes matching the user's constraints.
 */
export const fallbackPlan = (input: MealPlanGenerationInput): Recipe[] => {
  const candidates = DISH_LIBRARY.filter(
    (r) =>
      matchesAllergens(r, input.allergens) &&
      matchesCuisine(r, input.preferredCuisines) &&
      matchesProtein(r, input.preferredProteins) &&
      excludedDish(r, input.excludedIngredients) &&
      withinTime(r, input.maxTotalTimeMinutes),
  );

  if (candidates.length === 0) {
    const relaxed = DISH_LIBRARY.filter(
      (r) =>
        matchesAllergens(r, input.allergens) && excludedDish(r, input.excludedIngredients),
    );
    return dedupe(relaxed).slice(0, input.planLength);
  }
  return dedupe(candidates).slice(0, input.planLength);
};

const dedupe = (arr: Recipe[]): Recipe[] => {
  const seen = new Set<string>();
  const out: Recipe[] = [];
  for (const r of arr) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
};
