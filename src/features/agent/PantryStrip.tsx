/**
 * PantryStrip (PR #43) — the cook's persistent pantry, surfaced as
 * a horizontally scrollable chip list. Lives next to wherever the
 * cook is most likely to want the inventory in view:
 *
 *   - `RecipeDetailPage` — replace-ingredient flow ("have" the
 *     ingredient already).
 *   - `CookModePage` — running cook wants to know what else they
 *     could add.
 *   - `NewPlanPage` — wizard auto-fills from this list to give the
 *     MealPlan a "use your pantry" signal.
 *
 * Each chip carries:
 *   - quantity + unit (conditional)
 *   - condition badge (frozen / leftover / etc.)
 *   - "use soon" hint if `lastUsedAt` is older than 7 days
 *   - X button → `remove(itemId)`
 */

import { useCallback } from 'react';
import { Trash2, Sparkles } from 'lucide-react';

import { useToast } from '@/components/common/Toast';

import type { PantryItem } from './agentTypes';
import { usePantryItems } from '@/hooks/usePantryItems';

export type PantryStripProps = {
  uid: string | null;
  /** Optional callback when an item's chip is tapped (e.g. to
   *  pre-fill a form field). Defaults to remove-only. */
  onTapItem?: (item: PantryItem) => void;
  /** Optional empty-state message override. */
  emptyMessage?: string;
  className?: string;
};

const STALE_DAYS = 7;

const isStale = (item: PantryItem): boolean => {
  if (!item.lastUsedAt) return false;
  const last = new Date(item.lastUsedAt).getTime();
  if (Number.isNaN(last)) return false;
  return Date.now() - last > STALE_DAYS * 24 * 60 * 60 * 1000;
};

export const PantryStrip = ({
  uid,
  onTapItem,
  emptyMessage = 'Empty pantry — tap the mic to add ingredients you have on hand.',
  className = '',
}: PantryStripProps) => {
  const toast = useToast();
  const { items, loading, error, remove, demoMode } = usePantryItems(uid);

  const onRemove = useCallback(
    async (item: PantryItem) => {
      try {
        await remove(item.id);
        toast.push({
          kind: 'success',
          title: `Removed ${item.name}`,
        });
      } catch (err) {
        toast.push({
          kind: 'error',
          title: 'Could not remove',
          description: err instanceof Error ? err.message : 'Please try again.',
        });
      }
    },
    [remove, toast],
  );

  if (loading) {
    return (
      <p className={`text-xs text-ink-500 ${className}`}>Loading pantry…</p>
    );
  }
  if (error) {
    return (
      <p className={`text-xs text-tomato-600 ${className}`}>
        Pantry unavailable: {error}
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <p className={`text-xs text-ink-500 ${className}`}>{emptyMessage}</p>
    );
  }

  return (
    <div
      role="list"
      aria-label="Your pantry"
      data-testid="pantry-strip"
      className={`flex flex-wrap gap-1.5 ${className}`}
    >
      {demoMode && (
        <span className="self-center text-[10px] uppercase tracking-wide text-ink-400">
          demo
        </span>
      )}
      {items.map((item) => {
        const stale = isStale(item);
        const qty =
          item.quantity === null || item.unit === null
            ? ''
            : `${item.quantity} ${item.unit} `;
        return (
          <span
            key={item.id}
            role="listitem"
            className={[
              'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs',
              stale
                ? 'border-butter-400 bg-butter-100 text-ink-700'
                : 'border-basil-300 bg-basil-50 text-ink-800',
            ].join(' ')}
          >
            {stale && (
              <Sparkles
                size={10}
                aria-hidden="true"
                className="text-tomato-500"
              />
            )}
            <button
              type="button"
              className="font-medium hover:underline focus:underline"
              onClick={() => onTapItem?.(item)}
              title={
                onTapItem
                  ? `Use ${item.name} in your next suggestion`
                  : `Added ${new Date(item.addedAt).toLocaleDateString()}`
              }
            >
              <span>{qty}</span>
              <span>{item.name}</span>
              {item.condition && (
                <span className="ml-1 text-ink-500">({item.condition})</span>
              )}
            </button>
            {stale && (
              <span className="text-[10px] uppercase tracking-wide text-tomato-600">
                use soon
              </span>
            )}
            <button
              type="button"
              aria-label={`Remove ${item.name} from pantry`}
              className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-ink-500 hover:bg-tomato-100 hover:text-tomato-700"
              onClick={() => onRemove(item)}
            >
              <Trash2 size={10} aria-hidden="true" />
            </button>
          </span>
        );
      })}
    </div>
  );
};
