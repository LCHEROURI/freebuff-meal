import { useEffect, useMemo, useState } from 'react';
import { Loader2, ShieldAlert, X } from 'lucide-react';

import { Dialog } from '@/components/common/Dialog';
import { Button } from '@/components/common/Button';
import { AllergenBadge } from '@/components/common/AllergenBadge';
import { getSubstitutions, type SubstitutionCandidate } from './substitutionService';
import type { Allergen, Ingredient } from '@/schemas/ingredient';

/**
 * Per-tap ingredient swap modal.
 *
 * UX:
 *  - 0 candidates \u2192 "No curated alternatives found" with a single dismiss
 *    button. Honest UX: don't fake alternatives.
 *  - 1 candidate \u2192 single radio card, "Apply this swap" CTA. Fast.
 *  - 3+ candidates \u2192 radio list, same CTA. Common case.
 *  - If the chosen candidate carries `addedAllergens` that aren't already
 *    on the recipe, swap confirmation requires explicit consent via the
 *    danger chip + an extra "Apply anyway" CTA below the regular one.
 *
 * The dialog awaits `getSubstitutions(normalizedName)` from
 * `substitutionService` \u2014 swap-in for the Cloud Function follows without
 * any UI change once Item 1 deploys.
 */

export type SwapIngredientDialogProps = {
  /** The ingredient the cook tapped on. */
  ingredient: Ingredient | null;
  /** Allergens currently flagged on the recipe, so the dialog can highlight NEW ones. */
  recipeAllergens: ReadonlyArray<Allergen>;
  /** Resolve a chosen candidate into an updated ingredient. */
  onConfirm: (candidate: SubstitutionCandidate) => void;
  /** Dismiss the dialog without applying. */
  onClose: () => void;
};

const formatDisplay = (
  original: Ingredient,
  candidate: SubstitutionCandidate,
): string => {
  if (!candidate.ratio || candidate.ratio === 1) {
    return `${original.quantity} ${original.unit} ${candidate.replacement}`;
  }
  const qty = +(original.quantity * candidate.ratio).toFixed(2);
  return `${qty} ${original.unit} ${candidate.replacement}`;
};

export const SwapIngredientDialog = ({
  ingredient,
  recipeAllergens,
  onConfirm,
  onClose,
}: SwapIngredientDialogProps) => {
  const [candidates, setCandidates] = useState<SubstitutionCandidate[] | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);

  useEffect(() => {
    if (!ingredient) {
      setCandidates(null);
      setSelectedIdx(0);
      return;
    }
    let cancelled = false;
    setCandidates(null);
    setSelectedIdx(0);
    getSubstitutions(ingredient.normalizedName).then((res) => {
      if (cancelled) return;
      setCandidates(res);
      setSelectedIdx(0);
    });
    return () => {
      cancelled = true;
    };
  }, [ingredient]);

  const newAllergens = useMemo<Allergen[]>(() => {
    if (!candidates) return [];
    const sel = candidates[selectedIdx];
    if (!sel?.addedAllergens) return [];
    const existing = new Set(recipeAllergens);
    return sel.addedAllergens.filter((a) => !existing.has(a));
  }, [candidates, selectedIdx, recipeAllergens]);

  const isLoading = ingredient !== null && candidates === null;

  return (
    <Dialog
      open={ingredient !== null}
      onClose={onClose}
      title={
        ingredient
          ? `Swap \u201c${ingredient.displayText}\u201d`
          : 'Swap ingredient'
      }
      description="Pick a curated replacement \u2014 the change applies to this recipe and the consolidated shopping list."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={
              isLoading ||
              candidates === null ||
              candidates.length === 0 ||
              newAllergens.length > 0
            }
            onClick={() => {
              const sel = candidates?.[selectedIdx];
              if (sel) onConfirm(sel);
            }}
          >
            Apply swap
          </Button>
        </>
      }
    >
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-ink-700">
          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          Loading curated alternatives\u2026
        </div>
      ) : candidates && candidates.length === 0 ? (
        <p className="text-sm text-ink-700">
          No curated alternatives found for{' '}
          <strong>{ingredient?.normalizedName}</strong>. If you\u2019d like one,
          open a feature request \u2014 the table is curated, not LLM-generated.
        </p>
      ) : candidates ? (
        <ul className="space-y-2" role="radiogroup" aria-label="Curated alternatives">
          {candidates.map((c, i) => {
            const sel = i === selectedIdx;
            return (
              <li key={`${c.original}\u2192${c.replacement}`}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={sel}
                  onClick={() => setSelectedIdx(i)}
                  className={[
                    'flex w-full flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left transition-colors',
                    sel
                      ? 'border-tomato-500 bg-tomato-50 text-pepper-700'
                      : 'border-butter-300 bg-butter-50 text-pepper-700 hover:bg-butter-100',
                  ].join(' ')}
                >
                  <span className="font-medium">
                    {ingredient ? formatDisplay(ingredient, c) : c.replacement}
                  </span>
                  {c.note && <span className="text-xs text-ink-500">{c.note}</span>}
                  {c.addedAllergens && c.addedAllergens.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {c.addedAllergens.map((a) => (
                        <AllergenBadge key={a} label={a.replaceAll('_', ' ')} />
                      ))}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {newAllergens.length > 0 && (
        <div
          role="alert"
          className="mt-3 flex flex-col gap-2 rounded-lg border border-paprika-300 bg-paprika-50 p-3"
        >
          <p className="flex items-center gap-2 text-sm font-medium text-paprika-700">
            <ShieldAlert size={14} aria-hidden="true" />
            This swap introduces new allergens:
          </p>
          <div className="flex flex-wrap gap-1">
            {newAllergens.map((a) => (
              <AllergenBadge key={a} label={a.replaceAll('_', ' ')} />
            ))}
          </div>
          <p className="text-xs text-paprika-700">
            Review and confirm explicitly. Recipes with swapped-in allergens
            are flagged on shopping list generation.
          </p>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              const sel = candidates?.[selectedIdx];
              if (sel) onConfirm(sel);
            }}
            leftIcon={<X size={14} aria-hidden="true" />}
          >
            Apply anyway ({newAllergens.length} new{' '}
            {newAllergens.length === 1 ? 'allergen' : 'allergens'})
          </Button>
        </div>
      )}
    </Dialog>
  );
};
