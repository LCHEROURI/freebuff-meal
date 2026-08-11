import { Link, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save, ArrowLeft } from 'lucide-react';

import { plansStore, type DemoMealPlan } from '@/utils/demoAdapter';
import { useAuth } from '@/features/auth/authContext';
import { SectionCard } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input, Select } from '@/components/common/Input';
import { FormTextarea } from '@/components/common/FormInput';
import { VoiceInputButton } from '@/components/common/VoiceInputButton';
import { useToast } from '@/components/common/Toast';
import { RecipeSchema } from '@/schemas/recipe';
import { recipeFieldUI } from '@/lib/fieldUI';
import type { EmbeddedRecipe } from '@/schemas/mealPlan';
import { z } from 'zod';

/**
 * Subset of Recipe fields that are safe to edit post-generation.
 * Ingredients, steps, equipment, substitutions, and allergen data
 * are read-only — changing those would require re-validating the
 * entire recipe against the AI pipeline.
 */
const RecipeEditSchema = RecipeSchema.pick({
  name: true,
  shortDescription: true,
  cuisine: true,
  difficulty: true,
  servings: true,
  prepTimeMinutes: true,
  cookTimeMinutes: true,
  whyItFits: true,
}).extend({
  leftoverInstructions: z.string().max(1000).optional().default(''),
  presentationSuggestions: z.string().max(600).optional().default(''),
  foodSafetyNotes: z.string().max(600).optional().default(''),
});

type RecipeEditForm = z.infer<typeof RecipeEditSchema>;

const fieldToRecipeDefaults = (
  recipe: EmbeddedRecipe,
): RecipeEditForm => ({
  name: recipe.name,
  shortDescription: recipe.shortDescription,
  cuisine: recipe.cuisine,
  difficulty: recipe.difficulty,
  servings: recipe.servings,
  prepTimeMinutes: recipe.prepTimeMinutes,
  cookTimeMinutes: recipe.cookTimeMinutes,
  leftoverInstructions: recipe.leftoverInstructions ?? '',
  presentationSuggestions: recipe.presentationSuggestions.join('\n'),
  foodSafetyNotes: recipe.foodSafetyNotes.join('\n'),
  whyItFits: recipe.whyItFits,
});

const applyEdits = (
  recipe: EmbeddedRecipe,
  form: RecipeEditForm,
): EmbeddedRecipe => ({
  ...recipe,
  name: form.name,
  shortDescription: form.shortDescription,
  cuisine: form.cuisine,
  difficulty: form.difficulty,
  servings: form.servings,
  prepTimeMinutes: form.prepTimeMinutes,
  cookTimeMinutes: form.cookTimeMinutes,
  totalTimeMinutes: form.prepTimeMinutes + form.cookTimeMinutes,
  leftoverInstructions: form.leftoverInstructions.trim() || undefined,
  presentationSuggestions: form.presentationSuggestions
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean),
  foodSafetyNotes: form.foodSafetyNotes
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean),
  whyItFits: form.whyItFits,
});

export const RecipeEditPage = () => {
  const { recipeId, planId } = useParams<{
    recipeId: string;
    planId: string;
  }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [plan, setPlan] = useState<DemoMealPlan | null>(null);
  const [recipe, setRecipe] = useState<EmbeddedRecipe | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !planId) return;
    const found = plansStore.list(user.uid).find((p) => p.id === planId);
    if (found) {
      setPlan(found);
      const r = found.recipes.find((x) => x.id === recipeId);
      if (r) setRecipe(r);
    }
    setLoading(false);
  }, [user, planId, recipeId]);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<RecipeEditForm>({
    resolver: zodResolver(RecipeEditSchema),
    values: recipe ? fieldToRecipeDefaults(recipe) : undefined,
  });

  if (loading) {
    return <p className="text-sm text-ink-500">Loading…</p>;
  }

  if (!plan || !recipe) {
    return <p className="text-sm text-ink-500">Recipe not found.</p>;
  }

  const onSubmit = (form: RecipeEditForm) => {
    if (!user || !plan) return;

    const updatedRecipe = applyEdits(recipe, form);
    const updatedPlan: DemoMealPlan = {
      ...plan,
      recipes: plan.recipes.map((r) =>
        r.id === recipe.id ? updatedRecipe : r,
      ),
    };

    setRecipe(updatedRecipe);
    setPlan(updatedPlan);

    const allPlans = plansStore.list(user.uid);
    const nextAll = allPlans.map((p) =>
      p.id === plan.id ? updatedPlan : p,
    );
    plansStore.write(user.uid, nextAll);

    toast.push({
      kind: 'success',
      title: 'Recipe saved',
      description: `“${form.name}” updated.`,
    });
    navigate(`/app/plans/${plan.id}/recipes/${recipe.id}`, { replace: true });
  };

  const detailUrl = `/app/plans/${plan.id}/recipes/${recipe.id}`;

  return (
    <div>
      <header>
        <p className="text-xs uppercase tracking-wider text-ink-500">
          Editing
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {recipe.name}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Edit the metadata and prose fields. Ingredients, steps, and
          equipment are read-only — they come from the AI generator.
        </p>
      </header>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-4">
        <SectionCard title="Basics">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Name"
              {...register('name')}
              error={errors.name?.message}
            />
            <Input
              label="Cuisine"
              {...register('cuisine')}
              error={errors.cuisine?.message}
            />
            <div className="sm:col-span-2">
              <Input
                label="Short description"
                {...register('shortDescription')}
                error={errors.shortDescription?.message}
              />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Timing & portions">
          <div className="grid gap-4 sm:grid-cols-4">
            <Select
              label="Difficulty"
              {...register('difficulty')}
              error={errors.difficulty?.message}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </Select>
            <Input
              label="Servings"
              type="number"
              min={1}
              {...register('servings', { valueAsNumber: true })}
              error={errors.servings?.message}
            />
            <Input
              label="Prep time (min)"
              type="number"
              min={1}
              {...register('prepTimeMinutes', { valueAsNumber: true })}
              error={errors.prepTimeMinutes?.message}
            />
            <Input
              label="Cook time (min)"
              type="number"
              min={0}
              {...register('cookTimeMinutes', { valueAsNumber: true })}
              error={errors.cookTimeMinutes?.message}
            />
          </div>
        </SectionCard>

        <SectionCard title="Prose & notes">
          <div className="grid gap-4">
            <Input
              label="Why this dish fits the plan"
              {...register('whyItFits')}
              error={errors.whyItFits?.message}
            />

            <div data-voice-host className="relative">
              <FormTextarea
                fieldUI={recipeFieldUI}
                field="leftoverInstructions"
                label="Leftover instructions"
                placeholder="e.g. Store in an airtight container for up to 3 days. Reheat gently on the stovetop."
                rows={3}
                {...register('leftoverInstructions')}
                error={errors.leftoverInstructions?.message}
              />
              <div className="mt-1 flex justify-end">
                <VoiceInputButton />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-900">
                Presentation suggestions
              </label>
              <textarea
                rows={3}
                placeholder="One per line, e.g. Garnish with fresh parsley"
                className="input-base resize-y"
                {...register('presentationSuggestions')}
              />
              {errors.presentationSuggestions && (
                <span
                  className="mt-1 block text-xs font-medium text-danger-700"
                  role="alert"
                >
                  {errors.presentationSuggestions.message}
                </span>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-900">
                Food safety notes
              </label>
              <textarea
                rows={2}
                placeholder="One per line, e.g. Cook chicken to 165°F internal"
                className="input-base resize-y"
                {...register('foodSafetyNotes')}
              />
              {errors.foodSafetyNotes && (
                <span
                  className="mt-1 block text-xs font-medium text-danger-700"
                  role="alert"
                >
                  {errors.foodSafetyNotes.message}
                </span>
              )}
            </div>
          </div>
        </SectionCard>

        {/* Read-only summary of what can't be edited */}
        <SectionCard title="Read-only fields">
          <ul className="list-inside list-disc text-sm text-ink-500">
            <li>
              {recipe.ingredients.length} ingredient
              {recipe.ingredients.length !== 1 ? 's' : ''}
            </li>
            <li>
              {recipe.preparationSteps.length} prep step
              {recipe.preparationSteps.length !== 1 ? 's' : ''}
            </li>
            <li>
              {recipe.cookingSteps.length} cooking step
              {recipe.cookingSteps.length !== 1 ? 's' : ''}
            </li>
            <li>
              {recipe.equipment.length} piece
              {recipe.equipment.length !== 1 ? 's' : ''} of equipment
            </li>
            {recipe.allergenFlags.length > 0 && (
              <li>
                Allergens:{' '}
                {recipe.allergenFlags.map((a) => a.replaceAll('_', ' ')).join(', ')}
              </li>
            )}
            {recipe.dietaryTags.length > 0 && (
              <li>
                Dietary:{' '}
                {recipe.dietaryTags.map((t) => t.replaceAll('_', ' ')).join(', ')}
              </li>
            )}
          </ul>
        </SectionCard>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <Link to={detailUrl} replace>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              leftIcon={<ArrowLeft size={14} aria-hidden="true" />}
            >
              Back to recipe
            </Button>
          </Link>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={!isDirty}
            leftIcon={<Save size={16} aria-hidden="true" />}
          >
            Save changes
          </Button>
        </div>
      </form>
    </div>
  );
};
