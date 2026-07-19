import { useNavigate, useParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { Lock, LockOpen, RefreshCw, ShoppingCart, Share2, Trash2, Printer } from 'lucide-react';

import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Dialog } from '@/components/common/Dialog';
import { Chip } from '@/components/common/Chip';
import { AuthenticityBadge, DietaryBadge, AllergenBadge, Pill } from '@/components/common/AllergenBadge';
import { plansStore, ensureProfile } from '@/utils/demoAdapter';
import { useAuth } from '@/features/auth/authContext';
import { useToast } from '@/components/common/Toast';
import { usePlanService } from './mealPlanService';
import { createShare as createShareLink } from '@/features/sharing/sharingService';
import type { EmbeddedRecipe } from '@/schemas/mealPlan';
import type { DemoMealPlan } from '@/utils/demoAdapter';
import { MealPlanGenerationInputSchema } from '@/schemas/mealPlan';

type Reason = 'faster' | 'cheaper' | 'different_cuisine' | 'different_protein' | 'fewer_ingredients' | 'more_familiar' | 'use_more_pantry' | 'avoid_ingredient';

const REASONS: { value: Reason; label: string }[] = [
  { value: 'faster', label: 'Faster' },
  { value: 'cheaper', label: 'Cheaper' },
  { value: 'different_cuisine', label: 'Different cuisine' },
  { value: 'different_protein', label: 'Different protein' },
  { value: 'fewer_ingredients', label: 'Fewer ingredients' },
  { value: 'more_familiar', label: 'More familiar' },
  { value: 'use_more_pantry', label: 'Use my pantry more' },
  { value: 'avoid_ingredient', label: 'Avoid an ingredient' },
];

export const MealPlanPage = () => {
  const { user } = useAuth();
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const planService = usePlanService();

  const [plan, setPlan] = useState<DemoMealPlan | null>(null);
  const [regenTarget, setRegenTarget] = useState<{ recipeId: string; reason: Reason } | null>(null);
  const [reasonDetail, setReasonDetail] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !planId) return;
    const found = plansStore.list(user.uid).find((p) => p.id === planId);
    if (!found) {
      toast.push({ kind: 'error', title: 'Plan not found' });
      navigate('/app/plans', { replace: true });
      return;
    }
    setPlan(found);
    setNameInput(found.name);
  }, [user, planId, navigate, toast]);

  const persist = (next: DemoMealPlan) => {
    if (!user) return;
    const all = plansStore.list(user.uid);
    const updated = all.map((p) => (p.id === next.id ? { ...next, updatedAt: new Date().toISOString() } : p));
    plansStore.write(user.uid, updated);
    setPlan(updated.find((p) => p.id === next.id) ?? next);
  };

  const handleRegenerateOne = async () => {
    if (!regenTarget || !plan || !user) return;
    try {
      setSubmitting(true);
      const profile = ensureProfile(user.uid);
      const next = await planService.regenerateRecipe(
        plan.id,
        regenTarget.recipeId,
        regenTarget.reason,
        reasonDetail,
        plan.lockedRecipeIds,
        {
          preferredCuisines: profile.favoriteCuisines,
          preferredProteins: profile.preferredProteins,
          maxTotalTimeMinutes: profile.maxTotalTimeMinutes,
          allergens: profile.allergens,
          excludedIngredients: profile.excludedIngredients,
        },
      );
      const recipes = plan.recipes.map((r) =>
        r.id === regenTarget.recipeId ? next : r,
      );
      persist({ ...plan, recipes });
      toast.push({ kind: 'success', title: 'Recipe regenerated' });
      setRegenTarget(null);
      setReasonDetail('');
    } catch (err) {
      toast.push({
        kind: 'error',
        title: 'Could not regenerate',
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegenerateAll = async () => {
    if (!plan || !user) return;
    try {
      setSubmitting(true);
      const profile = ensureProfile(user.uid);
      // Coerce unknown planLength back to the literal union the schema accepts.
      const planLength = (plan.planLength === 3 || plan.planLength === 5 || plan.planLength === 7)
        ? plan.planLength
        : 5;
      const input = MealPlanGenerationInputSchema.parse({
        planLength,
        servings: plan.servings,
        maxTotalTimeMinutes: profile.maxTotalTimeMinutes,
        dietaryPattern: profile.dietaryPattern,
        allergens: profile.allergens,
        excludedIngredients: profile.excludedIngredients,
        preferredCuisines: profile.favoriteCuisines,
        preferredProteins: profile.preferredProteins,
        pantryIngredients: [],
        availableEquipment: profile.availableEquipment,
        skillLevel: profile.skillLevel,
        budgetPreference: profile.budgetPreference,
        leftoverPreference: profile.leftoverPreference,
        excludedRecipeIds: plan.lockedRecipeIds,
      });
      const locked = plan.recipes.filter((r) => plan.lockedRecipeIds.includes(r.id));
      const nextRecipes = await planService.regenerateAllPlan(locked, input);
      persist({ ...plan, recipes: nextRecipes });
      toast.push({
        kind: 'success',
        title: 'Plan regenerated',
        description: locked.length
          ? `Kept ${locked.length} locked recipes.`
          : 'All recipes replaced.',
      });
    } catch (err) {
      toast.push({
        kind: 'error',
        title: 'Could not regenerate plan',
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleLockToggle = (recipeId: string) => {
    if (!plan) return;
    const set = new Set(plan.lockedRecipeIds);
    if (set.has(recipeId)) set.delete(recipeId);
    else set.add(recipeId);
    persist({ ...plan, lockedRecipeIds: Array.from(set) });
  };

  const handleRename = () => {
    if (!plan) return;
    persist({ ...plan, name: nameInput.trim() || plan.name });
    setRenaming(false);
    toast.push({ kind: 'success', title: 'Plan renamed' });
  };

  const handleDelete = () => {
    if (!plan || !user) return;
    const all = plansStore.list(user.uid).filter((p) => p.id !== plan.id);
    plansStore.write(user.uid, all);
    toast.push({ kind: 'success', title: 'Plan deleted' });
    navigate('/app/plans', { replace: true });
  };

  const handlePrint = () => window.print();

  const handleShare = async () => {
    if (!plan) return;
    try {
      setSubmitting(true);
      const url = await createShareLink(plan);
      setShareUrl(url);
      setShareOpen(true);
    } catch (err) {
      toast.push({
        kind: 'error',
        title: 'Could not create share link',
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const orderedRecipes = useMemo<EmbeddedRecipe[]>(
    () => (plan ? [...plan.recipes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : []),
    [plan],
  );

  if (!plan) return null;

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-500">Meal plan</p>
          <h1 className="text-2xl font-semibold tracking-tight">{plan.name}</h1>
          <p className="mt-1 text-sm text-ink-500">{plan.summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setRenaming(true)}>
            Rename
          </Button>
          <Button variant="secondary" size="sm" onClick={handleShare} leftIcon={<Share2 size={14} aria-hidden="true" />}>
            Share
          </Button>
          <Button variant="secondary" size="sm" onClick={handlePrint} leftIcon={<Printer size={14} aria-hidden="true" />}>
            Print
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRegenerateAll}
            loading={submitting}
            leftIcon={<RefreshCw size={14} aria-hidden="true" />}
          >
            Regenerate plan
          </Button>
        <Button
          asChildLink
          to={`/app/plans/${plan.id}/shopping-list`}
          variant="primary"
          size="sm"
          leftIcon={<ShoppingCart size={14} aria-hidden="true" />}
        >
          Shopping list
        </Button>
        </div>
      </header>

      <p className="mt-2 text-xs text-ink-400">Model: {plan.modelName} · Prompt: {plan.promptVersion}</p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {orderedRecipes.map((r) => {
          const isLocked = plan.lockedRecipeIds.includes(r.id);
          return (
            <Card key={r.id}>
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="text-xs text-ink-500">{r.cuisine} · {r.originCountry}</p>
                  <h3 className="text-xl font-semibold tracking-tight">{r.name}</h3>
                  <p className="mt-1 text-sm text-ink-700">{r.shortDescription}</p>
                </div>
                <AuthenticityBadge label={r.authenticityLabel} />
              </header>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                <Pill>
                  ⏱ {r.totalTimeMinutes} min total
                </Pill>
                <Pill>🍽 {r.servings} servings</Pill>
                <Pill>👨‍🍳 {r.difficulty}</Pill>
                {r.dietaryTags?.slice(0, 3).map((t) => (
                  <DietaryBadge key={t} label={t.replaceAll('_', ' ')} />
                ))}
              </ul>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {r.allergenFlags.slice(0, 4).map((a) => (
                  <AllergenBadge key={a} label={a.replaceAll('_', ' ')} />
                ))}
              </ul>
              <p className="mt-3 text-xs text-ink-500">
                Main ingredients:{' '}
                {r.ingredients
                  .filter((i) => !i.isPantryItem)
                  .slice(0, 5)
                  .map((i) => i.name)
                  .join(', ')}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChildLink to={`/app/plans/${plan.id}/recipes/${r.id}`} variant="primary" size="sm">
                  View recipe
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setRegenTarget({ recipeId: r.id, reason: 'different_cuisine' })}
                  leftIcon={<RefreshCw size={14} aria-hidden="true" />}
                >
                  Regenerate
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleLockToggle(r.id)}
                  leftIcon={isLocked ? <Lock size={14} aria-hidden="true" /> : <LockOpen size={14} aria-hidden="true" />}
                  aria-pressed={isLocked}
                >
                  {isLocked ? 'Locked' : 'Lock'}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog
        open={renaming}
        onClose={() => setRenaming(false)}
        title="Rename plan"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename}>Save</Button>
          </>
        }
      >
        <label className="block">
          <span className="mb-1 inline-block text-sm font-medium">New name</span>
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            className="input-base"
            autoFocus
          />
        </label>
      </Dialog>

      <Dialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete this plan?"
        description="This action cannot be undone."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} leftIcon={<Trash2 size={14} aria-hidden="true" />}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-700">
          You're about to delete <strong>{plan.name}</strong>.
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-3 text-danger-700"
          onClick={() => setDeleting(true)}
          leftIcon={<Trash2 size={14} aria-hidden="true" />}
        >
          Delete this plan
        </Button>
      </Dialog>

      <Dialog
        open={regenTarget !== null}
        onClose={() => {
          setRegenTarget(null);
          setReasonDetail('');
        }}
        title="Regenerate this recipe"
        description="Pick a focus; the other recipes in your plan stay put."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setRegenTarget(null);
                setReasonDetail('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleRegenerateOne} loading={submitting}>
              Regenerate
            </Button>
          </>
        }
      >
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Focus</legend>
          <div className="flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <Chip
                key={r.value}
                active={regenTarget?.reason === r.value}
                onClick={() => setRegenTarget((t) => (t ? { ...t, reason: r.value } : t))}
              >
                {r.label}
              </Chip>
            ))}
          </div>
        </fieldset>
        <label className="mt-3 block">
          <span className="mb-1 inline-block text-sm font-medium">Detail (optional)</span>
          <input
            className="input-base"
            placeholder={
              regenTarget?.reason === 'avoid_ingredient'
                ? 'Ingredient to avoid…'
                : 'Anything else…'
            }
            value={reasonDetail}
            onChange={(e) => setReasonDetail(e.target.value)}
          />
        </label>
      </Dialog>

      <Dialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title="Share this plan"
        description={shareUrl ? 'Anyone with this link can view a read-only snapshot.' : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShareOpen(false)}>
              Close
            </Button>
            {shareUrl && (
              <Button
                onClick={() => {
                  navigator.clipboard?.writeText(shareUrl).catch(() => {});
                  toast.push({ kind: 'success', title: 'Link copied' });
                }}
              >
                Copy link
              </Button>
            )}
          </>
        }
      >
        {shareUrl && (
          <div className="space-y-2">
            <code className="block break-all rounded-md bg-cream-100 px-3 py-2 text-xs">{shareUrl}</code>
            <p className="text-xs text-ink-500">
              This snapshot excludes your email and any free-text request.
            </p>
          </div>
        )}
      </Dialog>
    </div>
  );
};
