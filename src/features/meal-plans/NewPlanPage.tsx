import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';

import { SectionCard } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input, Select, Textarea } from '@/components/common/Input';
import { Chip } from '@/components/common/Chip';
import { VoiceInputButton } from '@/components/common/VoiceInputButton';
import { AllergenSchema, DietaryPatternSchema, type Allergen, type DietaryPattern } from '@/schemas/ingredient';
import { MealPlanGenerationInputSchema, type MealPlanGenerationInput } from '@/schemas/mealPlan';
import { InlineSpinner } from '@/components/common/LoadingState';
import { useAuth } from '@/features/auth/authContext';
import { ensureProfile, profileStore, plansStore, type DemoMealPlan } from '@/utils/demoAdapter';
import { useToast } from '@/components/common/Toast';
import {
  DEFAULT_AVAILABLE_EQUIPMENT,
  DEFAULT_FAVORITE_CUISINES,
  normalizeCategoryName,
} from '@/features/settings/categories';
import { usePlanService } from './mealPlanService';
import { GenerationProgress } from './GenerationProgress';
import { PantryMicButton } from '@/features/agent/PantryMicButton';
import { PantryStrip } from '@/features/agent/PantryStrip';
import { usePantryItems } from '@/hooks/usePantryItems';

const PROTEINS = ['chicken', 'beef', 'pork', 'fish', 'tofu', 'eggs', 'lentils', 'chickpeas'];

const EXAMPLE_NOTE =
  'Plan five dinners for two people. Use the chicken thighs, spinach, rice, and tomatoes I already have. Keep each dinner under 40 minutes. Include Italian, Greek, and North African dishes. Avoid mushrooms.';

export const NewPlanPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const planService = usePlanService();
  const [generating, setGenerating] = useState(false);

  const profile = user ? ensureProfile(user.uid) : null;
  const { items: pantryItems } = usePantryItems(user?.uid ?? null);
  const onUsePantryFromStrip = () => {
    if (pantryItems.length === 0) return;
    const names = pantryItems.map((p) => p.name);
    /**
     * `pantryIngredients` is a free-text string (relaxed schema — PR
     * #44). We split on commas, fold in the pantry-strip names,
     * dedupe case-insensitively, then re-join with a comma so the
     * resulting value remains a sensible text-field value the
     * user can keep typing into.
     */
    const currentText = (values.pantryIngredients ?? '') as string;
    const current = currentText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const token of [...current, ...names]) {
      const key = token.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(token);
    }
    setValue('pantryIngredients', merged.join(', '), { shouldDirty: true });
    toast.push({
      kind: 'success',
      title: `Using ${names.length} pantry item${names.length === 1 ? '' : 's'}`,
    });
  };
  // The Settings `defaultPlanLength` is now `number` (int 1..7), but the
  // AI plan-record schema still restricts `planLength` to literal 3|5|7.
  // This is a deliberately half-finished widening — Settings accepts the
  // wider range so the user can express "2 dinners/week", but the AI plan
  // pipeline still emits a fixed-cardinality plan record. We cast here at
  // the form-boundary so the resolver's literal-union check stays green; if
  // the user's setting isn't a valid literal, zod will surface a validation
  // error on submit rather than silently coercing it.
  const defaults = profile
    ? {
        planLength: profile.defaultPlanLength as 3 | 5 | 7,
        servings: profile.defaultServings,
        maxTotalTimeMinutes: profile.maxTotalTimeMinutes,
        dietaryPattern: profile.dietaryPattern,
        allergens: profile.allergens,
        preferredCuisines: profile.favoriteCuisines,
        preferredProteins: profile.preferredProteins,
        availableEquipment: profile.availableEquipment,
        excludedIngredients: profile.excludedIngredients,
        skillLevel: profile.skillLevel,
        budgetPreference: profile.budgetPreference,
        leftoverPreference: profile.leftoverPreference,
        notes: '',
      }
    : {
        planLength: 5 as 3 | 5 | 7,
        servings: 2,
        maxTotalTimeMinutes: 45,
        dietaryPattern: 'none' as DietaryPattern,
        allergens: [] as Allergen[],
        preferredCuisines: [] as string[],
        preferredProteins: [] as string[],
        availableEquipment: [] as string[],
        excludedIngredients: [] as string[],
        skillLevel: 'intermediate' as const,
        budgetPreference: 'everyday' as const,
        leftoverPreference: 'some' as const,
        notes: '',
      };

  // Per-plan defaults: include the user's saved cuisine + equipment
  // selections AND any customs they've added — so the chip tray on the
  // plan form is consistent with the Settings screen.
  const safeNormalise = (raw: string): string | null =>
    normalizeCategoryName(raw);
  const allCuisines = Array.from(
    new Set([
      ...DEFAULT_FAVORITE_CUISINES,
      ...(profile?.customFavoriteCuisines ?? [])
        .map(safeNormalise)
        .filter((c): c is string => c !== null),
    ]),
  );
  const allEquipment = Array.from(
    new Set([
      ...DEFAULT_AVAILABLE_EQUIPMENT,
      ...(profile?.customEquipment ?? [])
        .map(safeNormalise)
        .filter((c): c is string => c !== null),
    ]),
  );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<MealPlanGenerationInput>({
    resolver: zodResolver(MealPlanGenerationInputSchema),
    defaultValues: defaults,
  });
  const values = watch();

  const toggleArray = (field: keyof MealPlanGenerationInput, value: string) => {
    const current = new Set((values[field] as string[] | undefined) ?? []);
    if (current.has(value)) current.delete(value);
    else current.add(value);
    setValue(field as keyof MealPlanGenerationInput, Array.from(current) as never, { shouldDirty: true });
  };

  const onSubmit = async (input: MealPlanGenerationInput) => {
    try {
      setGenerating(true);
      const recipes = await planService.generatePlan(input);
      // PR #43 — bump pantry usage counters for every ingredient name
      // the plan actually consumed. Best-effort: a network blip on
      // this call should NOT block the cook from seeing their plan.
      void planService.markPantryItemsUsed(
        recipes.flatMap((r) => r.ingredients.map((i) => i.name)),
      );
      const id = `plan-${Date.now().toString(36)}`;
      const plan: DemoMealPlan = {
        id,
        ownerId: user?.uid ?? 'demo-user',
        name: `${input.planLength}-night weeknight plan`,
        status: 'ready',
        planLength: input.planLength,
        servings: input.servings,
        recipes,
        lockedRecipeIds: [],
        promptVersion: 'meal-plan-system-v1',
        modelName: input.servings === 7 ? 'gemini-3.5-flash' : 'gemini-3.5-flash',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        summary: `${input.planLength} realistic dinners using ${
          (input.pantryIngredients ?? '').trim().length > 0
            ? 'your pantry ingredients'
            : 'common staples'
        }.`,
      };
      if (user) {
        const existing = plansStore.list(user.uid);
        plansStore.write(user.uid, [plan, ...existing]);
        if (profile) {
          profileStore.write(user.uid, {
            ...profile,
            defaultPlanLength: input.planLength,
            defaultServings: input.servings,
            maxTotalTimeMinutes: input.maxTotalTimeMinutes,
          });
        }
      }
      toast.push({
        kind: 'success',
        title: 'Plan generated',
        description: `${recipes.length} recipes ready to review.`,
      });
      navigate(`/app/plans/${id}`);
    } catch (err) {
      toast.push({
        kind: 'error',
        title: 'Generation failed',
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="relative">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">New meal plan</h1>
        <p className="mt-1 text-sm text-ink-500">
          Set your constraints, then let the AI pick dishes.
        </p>
      </header>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <SectionCard title="Plan shape">
          <div className="grid gap-4 sm:grid-cols-3">
            <Select label="Number of dinners" {...register('planLength', { valueAsNumber: true })}>
              <option value={3}>3 dinners</option>
              <option value={5}>5 dinners</option>
              <option value={7}>7 dinners</option>
            </Select>
            <Input
              label="Servings per dinner"
              type="number"
              min={1}
              max={12}
              {...register('servings', { valueAsNumber: true })}
              error={errors.servings?.message}
            />
            <Input
              label="Max total time (min)"
              type="number"
              min={15}
              max={180}
              {...register('maxTotalTimeMinutes', { valueAsNumber: true })}
              error={errors.maxTotalTimeMinutes?.message}
            />
          </div>
        </SectionCard>

        <SectionCard title="Diet & allergens">
          <div className="space-y-4">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Dietary pattern</legend>
              <div className="flex flex-wrap gap-2">
                {DietaryPatternSchema.options.map((label) => (
                  <Chip
                    key={label}
                    active={values.dietaryPattern === label}
                    onClick={() =>
                      setValue('dietaryPattern', label as DietaryPattern, { shouldDirty: true })
                    }
                  >
                    {label.replaceAll('_', ' ')}
                  </Chip>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Allergens</legend>
              <div className="flex flex-wrap gap-2">
                {AllergenSchema.options.map((label) => (
                  <Chip
                    key={label}
                    active={(values.allergens ?? []).includes(label as Allergen)}
                    onClick={() => toggleArray('allergens', label)}
                  >
                    {label.replaceAll('_', ' ')}
                  </Chip>
                ))}
              </div>
            </fieldset>
            <Input
              label="Other ingredients to exclude (comma-separated)"
              placeholder="e.g. cilantro, anchovies"
              rightIcon={<VoiceInputButton />}
              {...register('excludedIngredients')}
            />
          </div>
        </SectionCard>

        <SectionCard title="Cuisines, proteins, equipment">
          <div className="grid gap-4 md:grid-cols-3">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Preferred cuisines</legend>
              <div className="flex flex-wrap gap-2">
                {allCuisines.map((c) => (
                  <Chip
                    key={c}
                    active={(values.preferredCuisines ?? []).includes(c)}
                    onClick={() => toggleArray('preferredCuisines', c)}
                  >
                    {c}
                  </Chip>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Preferred proteins</legend>
              <div className="flex flex-wrap gap-2">
                {PROTEINS.map((p) => (
                  <Chip
                    key={p}
                    active={(values.preferredProteins ?? []).includes(p)}
                    onClick={() => toggleArray('preferredProteins', p)}
                  >
                    {p}
                  </Chip>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Available equipment</legend>
              <div className="flex flex-wrap gap-2">
                {allEquipment.map((e) => (
                  <Chip
                    key={e}
                    active={(values.availableEquipment ?? []).includes(e)}
                    onClick={() => toggleArray('availableEquipment', e)}
                  >
                    {e}
                  </Chip>
                ))}
              </div>
            </fieldset>
          </div>
        </SectionCard>

        <SectionCard title="Pantry and skill">
          {/* PR #43 — wizard idle state surfaces the ambient pantry
              strip directly above the existing pantryIngredients field
              so the cook sees "yes, you already have chicken, garbanzo,
              and a thing of garlic" *next to* the comma-separated text
              field those names auto-fill. No visual contradiction. */}
          <PantryMicButton uid={user?.uid ?? null} className="mb-2" />
          <div className="mb-4">
            <PantryStrip uid={user?.uid ?? null} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Input
                label="Pantry ingredients (auto-filled from voice pantry above)"
                placeholder="chicken, garbanzo, garlic, ..."
                rightIcon={<VoiceInputButton />}
                voiceAppendSeparator=", "
                {...register('pantryIngredients')}
              />
              <button
                type="button"
                className="mt-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-basil-700 hover:bg-basil-50 disabled:opacity-50"
                disabled={pantryItems.length === 0}
                onClick={onUsePantryFromStrip}
                title={
                  pantryItems.length > 0
                    ? `Auto-fill with ${pantryItems.length} pantry item${pantryItems.length === 1 ? '' : 's'}`
                    : 'Add items to your pantry first'
                }
              >
                Use pantry ({pantryItems.length})
              </button>
            </div>
            <Input
              label="Use soon (comma-separated)"
              placeholder="e.g. spinach, ripe tomatoes"
              rightIcon={<VoiceInputButton />}
              {...register('useSoonIngredients')}
            />
            <Select label="Skill level" {...register('skillLevel')}>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </Select>
            <Select label="Budget" {...register('budgetPreference')}>
              <option value="everyday">Everyday</option>
              <option value="moderate">Moderate</option>
              <option value="splurge">Splurge</option>
            </Select>
            <Select label="Leftovers" {...register('leftoverPreference')}>
              <option value="none">None</option>
              <option value="some">Some</option>
              <option value="lots">Lots</option>
            </Select>
          </div>
        </SectionCard>

        <SectionCard title="Anything else?">
          <div data-voice-host className="relative">
            <Textarea
              label="Free-text notes for the AI"
              placeholder={EXAMPLE_NOTE}
              {...register('notes')}
            />
            <div className="mt-1 flex justify-end">
              <VoiceInputButton />
            </div>
          </div>
          <p className="mt-2 text-xs text-ink-500">
            Tip: mention cuisine preferences, ingredients on hand, or anything
            you want to avoid. The AI will combine this with the structured
            fields above.
          </p>
        </SectionCard>

        <div className="mt-6 flex items-center justify-between gap-2">
          <p className="text-xs text-ink-500">
            Allergen tags on a dish come directly from its ingredient list —
            always double-check.
          </p>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={generating}
            disabled={generating}
            leftIcon={!generating ? <Sparkles size={16} aria-hidden="true" /> : null}
          >
            {generating ? (
              <>
                <InlineSpinner /> Generating…
              </>
            ) : (
              'Generate plan'
            )}
          </Button>
        </div>
      </form>

      {generating && <GenerationProgress />}
    </div>
  );
};
