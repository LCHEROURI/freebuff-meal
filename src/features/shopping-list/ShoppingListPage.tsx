import { Link, useParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { Plus, Printer, Copy } from 'lucide-react';

import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input, Select } from '@/components/common/Input';
import { Dialog } from '@/components/common/Dialog';
import { useToast } from '@/components/common/Toast';
import { ensureProfile, pantryStore, plansStore, shoppingStore, type DemoMealPlan } from '@/utils/demoAdapter';
import { useAuth } from '@/features/auth/authContext';
import { consolidate, itemIdentity } from './consolidate';
import type { ShoppingListItem } from '@/schemas/ingredient';

const CATEGORIES: Array<ShoppingListItem['category']> = [
  'produce',
  'meat_seafood',
  'dairy_refrigerated',
  'bakery',
  'frozen',
  'canned_jarred',
  'spices_seasonings',
  'pantry',
  'other',
];

const computeId = (i: ShoppingListItem) =>
  itemIdentity(i.normalizedName, i.unit, i.preparationNote, i.category);

export const ShoppingListPage = () => {
  const { planId } = useParams<{ planId: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const [plan, setPlan] = useState<DemoMealPlan | null>(null);
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !planId) return;
    const found = plansStore.list(user.uid).find((p) => p.id === planId);
    if (!found) return;
    setPlan(found);
    const persisted = shoppingStore.read(planId);
    if (persisted.length > 0) {
      setItems(persisted);
      return;
    }
    ensureProfile(user.uid);
    const recipes = found.recipes.map((r) => ({
      ...r,
      ingredients: r.ingredients.map((i) => ({
        ...i,
        recipeId: r.id,
        recipeName: r.name,
      })),
    }));
    const flatIngredients = recipes.flatMap((r) => r.ingredients);
    const pantryItems = pantryStore.read(user.uid);
    // `consolidate()` already assigns `sortOrder = idx` for each item; we
    // use the array's natural order as the display order.
    const consolidated = consolidate(flatIngredients, pantryItems);
    setItems(consolidated);
    shoppingStore.write(planId, consolidated);
  }, [user, planId]);

  const persist = (next: ShoppingListItem[]) => {
    if (!planId) return;
    setItems(next);
    shoppingStore.write(planId, next);
  };

  const grouped = useMemo(() => {
    const map = new Map<ShoppingListItem['category'], ShoppingListItem[]>();
    for (const c of CATEGORIES) map.set(c, []);
    for (const item of items) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return map;
  }, [items]);

  const handleAdd = (it: Omit<ShoppingListItem, 'sortOrder' | 'isChecked'>) => {
    // Stable next-sortOrder that survives remove/add cycles: use max+1.
    const nextSort = items.reduce((m, i) => Math.max(m, i.sortOrder), -1) + 1;
    const next = [
      ...items,
      {
        ...it,
        sortOrder: nextSort,
        isChecked: false,
        isCustom: true,
      } as ShoppingListItem,
    ];
    persist(next);
    setAdding(false);
  };

  const handleRemove = (id: string) => persist(items.filter((i) => computeId(i) !== id));

  const toggleCheck = (id: string) => {
    persist(
      items.map((i) =>
        computeId(i) === id ? { ...i, isChecked: !i.isChecked } : i,
      ),
    );
  };

  const updateQuantity = (id: string, qty: number) => {
    persist(items.map((i) => {
      if (computeId(i) !== id) return i;
      const displayText = qty === 0
        ? i.displayText
        : `${qty} ${i.unit} ${i.name}${i.preparationNote ? `, ${i.preparationNote}` : ''}`;
      return { ...i, quantity: qty, displayText };
    }));
  };

  const clearChecked = () => {
    persist(items.filter((i) => !i.isChecked));
    toast.push({ kind: 'success', title: 'Checked items cleared' });
  };

  const copy = async () => {
    const text = items
      .filter((i) => !i.isChecked)
      .map((i) => `- ${i.displayText}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.push({ kind: 'success', title: 'Shopping list copied' });
    } catch {
      toast.push({ kind: 'error', title: 'Could not copy' });
    }
  };

  if (!plan) return <p className="text-sm text-ink-500">Loading…</p>;

  const checkedCount = items.filter((i) => i.isChecked).length;
  const totalCount = items.length;

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-500">Shopping list</p>
          <h1 className="text-2xl font-semibold tracking-tight">{plan.name}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {checkedCount} of {totalCount} checked
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={copy} leftIcon={<Copy size={14} aria-hidden="true" />}>
            Copy
          </Button>
          <Button variant="secondary" size="sm" onClick={() => window.print()} leftIcon={<Printer size={14} aria-hidden="true" />}>
            Print
          </Button>
          <Button variant="secondary" size="sm" onClick={clearChecked}>
            Clear checked
          </Button>
          <Button variant="primary" size="sm" onClick={() => setAdding(true)} leftIcon={<Plus size={14} aria-hidden="true" />}>
            Add item
          </Button>
        </div>
      </header>

      <p className="mt-3 text-xs text-ink-400">
        Items the AI flagged as pantry are listed at the bottom so you can skip them.
      </p>

      <div className="mt-4 space-y-4">
        {CATEGORIES.map((cat) => {
          const list = grouped.get(cat) ?? [];
          if (list.length === 0) return null;
          const label = cat.replaceAll('_', ' ');
          const isPantryGroup = cat === 'pantry' || list.every((i) => i.isPantryItem);
          return (
            <Card key={cat} title={isPantryGroup ? `Pantry · ${label}` : label}>
              <ul className="divide-y divide-border">
                {list.map((it) => {
                  const id = computeId(it);
                  return (
                    <li key={id} className="flex items-center gap-2 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={it.isChecked}
                        onChange={() => toggleCheck(id)}
                        aria-label={`Mark ${it.name} as ${it.isChecked ? 'needed' : 'purchased'}`}
                      />
                      <span className={it.isChecked ? 'line-through opacity-60' : ''}>
                        {it.displayText}
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(id)} className="ml-auto">
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleRemove(id)}>
                        Remove
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
      </div>

      <AddItemDialog
        open={adding}
        onClose={() => setAdding(false)}
        onAdd={handleAdd}
      />

      <EditItemDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        item={editing ? items.find((i) => computeId(i) === editing) ?? null : null}
        onSave={(qty) => {
          if (editing) updateQuantity(editing, qty);
          setEditing(null);
        }}
      />

      <p className="mt-6 text-sm">
        <Link to={`/app/plans/${plan.id}`} className="text-sage-700 hover:underline">
          ← Back to plan
        </Link>
      </p>
    </div>
  );
};

const AddItemDialog = ({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (it: Omit<ShoppingListItem, 'sortOrder' | 'isChecked'>) => void;
}) => {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState<ShoppingListItem['unit']>('piece');
  const [category, setCategory] = useState<ShoppingListItem['category']>('other');

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add custom item"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!name.trim()) return;
              const displayText = `${quantity} ${unit} ${name}`;
              onAdd({
                name,
                normalizedName: name.toLowerCase(),
                category,
                isOptional: false,
                isPantryItem: false,
                allergenFlags: [],
                quantity,
                unit,
                displayText,
                isCustom: true,
              });
              setName('');
              setQuantity(1);
              setUnit('piece');
              setCategory('other');
            }}
          >
            Add
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Item name" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Quantity"
            type="number"
            min={0}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
          <Select label="Unit" value={unit} onChange={(e) => setUnit(e.target.value as ShoppingListItem['unit'])}>
            {['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'piece', 'clove', 'pinch', 'slice', 'can', 'bunch', 'package'].map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </Select>
        </div>
        <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value as ShoppingListItem['category'])}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c.replaceAll('_', ' ')}</option>
          ))}
        </Select>
      </div>
    </Dialog>
  );
};

const EditItemDialog = ({
  open,
  onClose,
  item,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  item: ShoppingListItem | null;
  onSave: (qty: number) => void;
}) => {
  const [qty, setQty] = useState<number>(item?.quantity ?? 1);
  useEffect(() => {
    setQty(item?.quantity ?? 1);
  }, [item]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={item ? `Edit ${item.name}` : 'Edit item'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(qty)}>
            Save
          </Button>
        </>
      }
    >
      {item && (
        <div className="space-y-3">
          <Input
            label="Quantity"
            type="number"
            min={0}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
          />
          <p className="text-xs text-ink-500">
            Pressing save updates the persisted shopping list. Remove drops the item entirely.
          </p>
        </div>
      )}
    </Dialog>
  );
};
