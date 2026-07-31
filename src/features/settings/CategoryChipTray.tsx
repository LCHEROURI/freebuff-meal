/**
 * <CategoryChipTray /> — generic chip-tray with inline "+ Add" affordance.
 *
 * Renders available categories = defaults ∪ user-customs. Selection state
 * lives on the parent RHF form (`selectedField`); customs live in the
 * Zustand store (`useCategoryStore`) keyed by uid, so a future cuisine
 * filter chip on the dashboard re-renders the moment Settings saves.
 *
 * Behaviour:
 *   ▸ Click a chip → toggles in `selectedField`.
 *   ▸ Click "+ Add" → reveals inline input; Enter or "Save" commits.
 *   ▸ Type validation: empty / whitespace-only / over 40 chars / case-folded
 *     duplicate of defaults ∪ customs ∪ selection → inline error.
 *   ▸ Default chips are NOT removable (they're curated, not user data).
 *     Custom chips get an X icon.
 *   ▸ Voice input button on the inline add input mirrors the rest of the
 *     app's speech-first pattern.
 */
import { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';

import { Chip } from '@/components/common/Chip';
import { Button } from '@/components/common/Button';
import { useToast } from '@/components/common/Toast';
import {
  canAddCustom,
  findDuplicate,
  isCategoryDuplicate,
  mergeWithDefaults,
  normalizeCategoryName,
} from './categories';

/**
 * RHF's `watch(field)` returns a strongly-typed `Path<T>` value. We
 * deliberately accept loose function shapes here so callers don't fight
 * RHF's `Path<T>` strictness on every dynamic key — the contract is
 * "the function and the on-form schema agree that the field is a
 * `string[]`", which is locally enforced at each call site.
 */
export type CategoryChipTrayWatch = (field: string) => string[] | undefined;
export type CategoryChipTraySetValue = (
  field: string,
  value: string[],
  opts?: { shouldDirty?: boolean },
) => void;

export type CategoryChipTrayProps = {
  watch: CategoryChipTrayWatch;
  setValue: CategoryChipTraySetValue;
  /** Form field key holding the array of *selected* values. */
  selectedField: string;
  /** Form field key holding the array of *user-added custom* values. */
  customField: string;
  /** Curated, never-removed list of built-in categories. */
  defaults: readonly string[];
  /** Visible legend for the fieldset. */
  legend: string;
  /** Placeholder for the inline "+ Add" input. */
  placeholder: string;
  /** Optional prefix shown on non-active chips (e.g. cuisine = 🇮🇹 flag). */
  toLabel?: (value: string) => { prefix?: string; label: string };
  /** Hint shown above the inline add input on first reveal. */
  addHint?: string;
};

const inputClass =
  'flex-1 rounded-md border border-ink-200 bg-white px-2 py-1 text-sm outline-none focus:border-ink-400';

export const CategoryChipTray = ({
  watch,
  setValue,
  selectedField,
  customField,
  defaults,
  legend,
  placeholder,
  toLabel,
  addHint,
}: CategoryChipTrayProps) => {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => watch(selectedField) ?? [],
    [selectedField, watch],
  );
  const customs = useMemo(
    () => watch(customField) ?? [],
    [customField, watch],
  );

  const { available, droppedFromCustoms } = useMemo(
    () => mergeWithDefaults(defaults, customs),
    [defaults, customs],
  );

  // If a shipped default now shadows a user-saved custom (after a default
  // list update), prune the loser from the form state on render.
  useEffect(() => {
    if (droppedFromCustoms.length === 0) return;
    const next = customs.filter((c) => !droppedFromCustoms.includes(c));
    setValue(customField, next, { shouldDirty: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [droppedFromCustoms.length]);

  const toggle = (value: string) => {
    const set = new Set(selected);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    setValue(selectedField, Array.from(set), { shouldDirty: true });
  };

  const trySubmit = () => {
    const normalised = normalizeCategoryName(draft);
    if (!normalised) {
      setError('Enter a name first.');
      return;
    }
    if (!canAddCustom(customs)) {
      setError('You have reached the custom-category limit.');
      return;
    }
    if (isCategoryDuplicate(normalised, defaults, customs, selected)) {
      const dup = findDuplicate(normalised, [...defaults, ...customs, ...selected]);
      setError(`Already present${dup ? ` as “${dup}”.` : '.'}`);
      return;
    }
    setError(null);
    setDraft('');
    const nextCustoms = [...customs, normalised];
    setValue(customField, nextCustoms, { shouldDirty: true });
    const nextSelected = Array.from(new Set([...selected, normalised]));
    setValue(selectedField, nextSelected, { shouldDirty: true });
    setAdding(false);
    toast.push({
      kind: 'success',
      title: `Added ${normalised}`,
      description: 'Saved on Save settings below.',
    });
  };

  const removeCustom = (value: string) => {
    setValue(
      customField,
      customs.filter((c) => c !== value),
      { shouldDirty: true },
    );
    setValue(
      selectedField,
      selected.filter((s) => s !== value),
      { shouldDirty: true },
    );
  };

  const renderChip = (value: string) => {
    const isCustom = !defaults.includes(value);
    const isActive = selected.includes(value);
    const { prefix, label } = toLabel ? toLabel(value) : { prefix: undefined, label: value };
    return (
      <span key={value} className="relative">
        <Chip
          active={isActive}
          prefix={prefix}
          onClick={() => toggle(value)}
          aria-label={`Toggle ${label}`}
        >
          {label}
        </Chip>
        {isCustom && (
          <button
            type="button"
            aria-label={`Remove custom ${label}`}
            onClick={(e) => {
              e.stopPropagation();
              removeCustom(value);
            }}
            className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-ink-500 shadow ring-1 ring-ink-200 hover:text-rose-600"
          >
            <X size={10} aria-hidden="true" />
          </button>
        )}
      </span>
    );
  };

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap items-center gap-2">
        {available.map(renderChip)}
        {!adding ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setAdding(true);
              setError(null);
              setDraft('');
            }}
            leftIcon={<Plus size={14} aria-hidden="true" />}
          >
            Add custom
          </Button>
        ) : (
          <div className="flex w-full flex-col gap-1 sm:w-auto sm:flex-row sm:items-center">
            <div className="flex flex-1 items-center gap-1">
              <input
                aria-label={`Add custom ${legend.toLowerCase()}`}
                placeholder={placeholder}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    trySubmit();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setAdding(false);
                    setDraft('');
                    setError(null);
                  }
                }}
                className={inputClass}
                maxLength={40}
                autoFocus
              />
            </div>
            <div className="flex gap-1">
              <Button type="button" size="sm" variant="primary" onClick={trySubmit}>
                Save
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  setAdding(false);
                  setDraft('');
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-rose-600">
          {error}
        </p>
      )}
      {adding && addHint && !error && (
        <p className="mt-1 text-xs text-ink-500">{addHint}</p>
      )}
    </fieldset>
  );
};

// Re-export the normalisation helper so the parent can independently build
// display-aware prefixes without importing the helpers module twice.
export { normalizeCategoryName };
