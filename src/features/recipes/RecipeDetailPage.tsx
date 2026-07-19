import { Link, useParams } from 'react-router-dom';
import { ChefHat, Printer, Replace, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { plansStore, type DemoMealPlan } from '@/utils/demoAdapter';
import { useAuth } from '@/features/auth/authContext';
import { AuthenticityBadge, DietaryBadge, AllergenBadge, Pill } from '@/components/common/AllergenBadge';
import { Button } from '@/components/common/Button';
import { useToast } from '@/components/common/Toast';
import { Card } from '@/components/common/Card';
import type { EmbeddedRecipe } from '@/schemas/mealPlan';
import type { Ingredient } from '@/schemas/ingredient';
import { SwapIngredientDialog } from './SwapIngredientDialog';
import type { SubstitutionCandidate } from './substitutionService';

export const RecipeDetailPage = () => {
  const { recipeId, planId } = useParams<{ recipeId: string; planId: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const [plan, setPlan] = useState<DemoMealPlan | null>(null);
  const [recipe, setRecipe] = useState<EmbeddedRecipe | null>(null);
  const [swapTarget, setSwapTarget] = useState<Ingredient | null>(null);

  useEffect(() => {
    if (!user || !planId) return;
    const found = plansStore.list(user.uid).find((p) => p.id === planId);
    if (found) {
      setPlan(found);
      const r = found.recipes.find((x) => x.id === recipeId);
      if (r) setRecipe(r);
    }
  }, [user, planId, recipeId]);

  if (!plan || !recipe) {
    return <p className="text-sm text-ink-500">Recipe not found.</p>;
  }

  const handleShare = () => {
    const url = `${window.location.origin}/app/plans/${plan.id}/recipes/${recipe.id}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    toast.push({ kind: 'success', title: 'Recipe link copied' });
  };

  /**
   * Apply a chosen substitution: mutate the recipe in memory, append to the
   * `substitutions` audit trail, persist via the demo adapter, and surface
   * a toast. Cloud Function write-through ships with Item 1's backend deploy
   * — for MVP this is a local write that mirrors what /api/substitutions
   * will do server-side.
   */
  const applySwap = (target: Ingredient, candidate: SubstitutionCandidate) => {
    if (!recipe || !plan || !user) return;
    const ratio = candidate.ratio ?? 1;
    const newQuantity = +(target.quantity * ratio).toFixed(2);
    const newIngredient: Ingredient = {
      ...target,
      name: candidate.replacement,
      normalizedName: candidate.replacement.toLowerCase().replace(/\s+/g, ' ').trim(),
      quantity: newQuantity,
      displayText: `${newQuantity} ${target.unit} ${candidate.replacement}`,
      ...(candidate.note ? { preparationNote: candidate.note } : { preparationNote: undefined }),
    };
    const updatedRecipe: EmbeddedRecipe = {
      ...recipe,
      ingredients: recipe.ingredients.map((ing) => (ing === target ? newIngredient : ing)),
      substitutions: [
        ...recipe.substitutions,
        {
          original: target.name,
          replacement: candidate.replacement,
          ...(candidate.note ? { note: candidate.note } : {}),
          ...(candidate.ratio ? { ratio: candidate.ratio } : {}),
          ...(candidate.addedAllergens ? { addedAllergens: candidate.addedAllergens } : {}),
        },
      ],
    };
    const updatedPlan: DemoMealPlan = {
      ...plan,
      recipes: plan.recipes.map((r) => (r.id === recipe.id ? updatedRecipe : r)),
    };
    setRecipe(updatedRecipe);
    setPlan(updatedPlan);
    setSwapTarget(null);
    const allPlans = plansStore.list(user.uid);
    const nextAll = allPlans.map((p) => (p.id === plan.id ? updatedPlan : p));
    plansStore.write(user.uid, nextAll);
    toast.push({
      kind: 'success',
      title: 'Ingredient swapped',
      description: `${target.name} \u2192 ${candidate.replacement}`,
    });
  };

  return (
    <article className="print-friendly">
      <p className="text-xs text-ink-500">
        <Link to={`/app/plans/${plan.id}`} className="hover:underline">
          \u2190 Back to {plan.name}
        </Link>
      </p>

      <header className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-500">
            {recipe.cuisine} \u00b7 {recipe.originCountry}
            {recipe.originCountryCode ? ` (${recipe.originCountryCode})` : ''}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">{recipe.name}</h1>
          <p className="mt-2 max-w-2xl text-ink-700">{recipe.shortDescription}</p>
        </div>
        <AuthenticityBadge label={recipe.authenticityLabel} />
      </header>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <Pill>\u23f1 {recipe.totalTimeMinutes} min total</Pill>
        <Pill>\ud83c\udf7d {recipe.servings} servings</Pill>
        <Pill>\ud83d\udc68\u200d\ud83c\udf73 {recipe.difficulty}</Pill>
        {recipe.dietaryTags?.map((t) => (
          <DietaryBadge key={t} label={t.replaceAll('_', ' ')} />
        ))}
        {recipe.allergenFlags.map((a) => (
          <AllergenBadge key={a} label={a.replaceAll('_', ' ')} />
        ))}
      </div>

      <div className="mt-6 no-print flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => window.print()}
          leftIcon={<Printer size={14} aria-hidden="true" />}
        >
          Print
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleShare}
          leftIcon={<Share2 size={14} aria-hidden="true" />}
        >
          Copy link
        </Button>
        <Link
          to={`/app/plans/${plan.id}/recipes/${recipe.id}/cook`}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-tomato-500 px-4 py-2.5 font-medium text-white shadow-warm transition-colors hover:bg-tomato-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-basil-500 focus-visible:ring-offset-2 focus-visible:ring-offset-flour-50"
        >
          <ChefHat size={16} aria-hidden="true" />
          Start cooking
        </Link>
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <Card title="Equipment">
          <ul className="list-inside list-disc text-sm">
            {recipe.equipment.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Card>

        <Card title="Ingredients">
          <h3 className="sr-only">Ingredients grouped by category</h3>
          {groupIngredients(recipe).map(({ category, items }) => (
            <div key={category} className="mt-3 first:mt-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                {category}
              </p>
              <ul className="mt-1 divide-y divide-border text-sm">
                {items.map((ing, i) => (
                  <li
                    key={`${ing.name}-${i}`}
                    className="group flex items-center gap-2 py-1"
                  >
                    <span className="font-medium">{ing.displayText}</span>
                    {ing.preparationNote && (
                      <span className="text-ink-500">({ing.preparationNote})</span>
                    )}
                    {ing.isOptional && <span className="text-xs text-ink-400">optional</span>}
                    <button
                      type="button"
                      onClick={() => setSwapTarget(ing)}
                      className="no-print ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-tomato-600 opacity-0 transition-opacity hover:bg-tomato-50 hover:text-tomato-700 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100"
                      aria-label={`Swap ${ing.name}`}
                    >
                      <Replace size={12} aria-hidden="true" />
                      Swap
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="mt-3 text-xs text-ink-500">
            <em>Why this dish:</em> {recipe.whyItFits}
          </p>
        </Card>
      </section>

      <Card title="Preparation" className="mt-4">
        <ol className="list-inside list-decimal space-y-1.5 text-sm">
          {recipe.preparationSteps.map((s) => (
            <li key={s.order}>{s.text}</li>
          ))}
        </ol>
      </Card>

      <Card title="Cooking" className="mt-4">
        <ol className="list-inside list-decimal space-y-1.5 text-sm">
          {recipe.cookingSteps.map((s) => (
            <li key={s.order}>{s.text}</li>
          ))}
        </ol>
      </Card>

      {recipe.presentationSuggestions.length > 0 && (
        <Card title="Presentation" className="mt-4">
          <ul className="list-inside list-disc space-y-1 text-sm">
            {recipe.presentationSuggestions.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </Card>
      )}

      {recipe.substitutions.length > 0 && (
        <Card title="Substitutions" className="mt-4">
          <ul className="divide-y divide-border text-sm">
            {recipe.substitutions.map((s) => (
              <li key={s.original + s.replacement} className="py-2">
                <strong>{s.original}</strong> \u2192 {s.replacement}
                {s.note && <span className="text-ink-500"> ({s.note})</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {recipe.leftoverInstructions && (
        <Card title="Leftovers" className="mt-4">
          <p className="text-sm">{recipe.leftoverInstructions}</p>
        </Card>
      )}

      {recipe.foodSafetyNotes.length > 0 && (
        <Card title="Food safety" className="mt-4">
          <ul className="list-inside list-disc text-sm">
            {recipe.foodSafetyNotes.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </Card>
      )}

      <SwapIngredientDialog
        ingredient={swapTarget}
        recipeAllergens={recipe.allergenFlags}
        onConfirm={(candidate) => {
          if (swapTarget) applySwap(swapTarget, candidate);
        }}
        onClose={() => setSwapTarget(null)}
      />
    </article>
  );
};

const groupIngredients = (r: { ingredients: Ingredient[] }) => {
  const groups = new Map<string, Ingredient[]>();
  for (const ing of r.ingredients) {
    const list = groups.get(ing.category) ?? [];
    list.push(ing);
    groups.set(ing.category, list);
  }
  return Array.from(groups, ([category, items]) => ({ category, items }));
};
