/**
 * usePantryItems — live pantry read + write surface (PR #43).
 *
 * Two modes:
 *
 *   1. **Firebase mode** — uses Firestore `onSnapshot` so a pantry
 *      edit from any device lands in every open tab within ~1 s.
 *      Rules enforce `ownerId == auth.uid`; failures here surface
 *      as `error` (a permission-denied rule means the read path
 *      was misconfigured, not a transient failure).
 *
 *   2. **Demo mode** — uses a per-uid `localStorage` mirror plus a
 *      `storage`-event cross-tab sync, so demo users still see
 *      their pantry update reactively.
 *
 * The returned shape is identical in both modes: `items`,
 * `loading`, `error`, plus `add` / `remove` / `markUsed` writers
 * that route through `agentClient` so production and demo behavior
 * never fork at the call site.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  type FirestoreError,
  type QuerySnapshot,
  type DocumentData,
} from 'firebase/firestore';

import { initFirebase, getDb } from '@/lib/firebase/app';
import { isFirebaseConfigured } from '@/lib/env';

import type { PantryItem } from '@/features/agent/agentTypes';
import { agentClient } from '@/features/agent/agentClient';

type WriteStatus = 'idle' | 'saving' | 'error';

export type UsePantryItemsResult = {
  items: PantryItem[];
  loading: boolean;
  error: string | null;
  writeStatus: WriteStatus;
  add: (preview: Array<{
    name: string;
    quantity: number | null;
    unit: string | null;
    condition: PantryItem['condition'];
    confidence: number;
    note?: string | null;
  }>) => Promise<void>;
  remove: (itemId: string) => Promise<void>;
  /** Bump usage counters when a generated plan used these names. */
  markUsed: (ingredientNames: string[]) => Promise<void>;
  demoMode: boolean;
};

const PANTRY_LOCAL_KEY_PREFIX = 'freebuff:pantry:';

export const usePantryItems = (uid: string | null): UsePantryItemsResult => {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [writeStatus, setWriteStatus] = useState<WriteStatus>('idle');

  const demo = !isFirebaseConfigured();

  // -----------------------------------------------------------------
  //  Read path.
  // -----------------------------------------------------------------
  useEffect(() => {
    if (!uid) {
      setItems([]);
      setLoading(false);
      return;
    }

    if (!demo) {
      initFirebase();
      const db = getDb();
      if (!db) {
        // The Firebase config came back invalid at runtime — fall back
        // to a static empty list rather than thrash on re-renders.
        setItems([]);
        setLoading(false);
        setError('Pantry unavailable: Firebase not initialized.');
        return;
      }
      const unsubscribe = onSnapshot(
        query(
          collection(db, 'pantryItems'),
          where('ownerId', '==', uid),
          orderBy('addedAt', 'desc'),
          limit(50),
        ),
        (snap: QuerySnapshot<DocumentData>) => {
          const next: PantryItem[] = [];
          for (const doc of snap.docs) {
            const raw = doc.data() as PantryItem & { ownerId?: string };
            // Defense in depth — the rule enforces this, but a stale
            // client cache might surface a doc we don't own.
            if (raw.ownerId !== uid) continue;
            next.push(raw);
          }
          setItems(next);
          setLoading(false);
          setError(null);
        },
        (err: FirestoreError) => {
          setError(`Pantry read failed: ${err.message}`);
          setLoading(false);
        },
      );
      return () => unsubscribe();
    }

    // Demo-mode read. Pull initial value + cross-tab sync.
    const readOnce = () => {
      try {
        const raw = window.localStorage.getItem(`${PANTRY_LOCAL_KEY_PREFIX}${uid}`);
        if (!raw) return [] as PantryItem[];
        return JSON.parse(raw) as PantryItem[];
      } catch {
        return [] as PantryItem[];
      }
    };
    setItems(readOnce());
    setLoading(false);
    const onStorage = (ev: StorageEvent) => {
      if (ev.key !== `${PANTRY_LOCAL_KEY_PREFIX}${uid}`) return;
      try {
        const next = ev.newValue ? (JSON.parse(ev.newValue) as PantryItem[]) : [];
        setItems(next);
      } catch {
        // localStorage was clobbered between tabs — best-effort ignored.
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [uid, demo]);

  // -----------------------------------------------------------------
  //  Writes — all go through the agentClient shim so the same UX
  //  works in both modes.
  // -----------------------------------------------------------------
  const add = useCallback(
    async (
      preview: Array<{
        name: string;
        quantity: number | null;
        unit: string | null;
        condition: PantryItem['condition'];
        confidence: number;
        note?: string | null;
      }>,
    ) => {
      if (preview.length === 0) return;
      setWriteStatus('saving');
      try {
        const res = await agentClient.addPantryItems({ items: preview, source: 'voice' });
        // Refresh from server (or local mirror) so the canonical `addedAt`
        // stamp + server-assigned `id` are reflected.
        if (demo) {
          setItems((prev) => mergeItems(prev, res.items));
        }
        setWriteStatus('idle');
      } catch (err) {
        setWriteStatus('error');
        setError(err instanceof Error ? err.message : 'Pantry write failed.');
        throw err;
      }
    },
    [demo],
  );

  const remove = useCallback(
    async (itemId: string) => {
      setWriteStatus('saving');
      try {
        await agentClient.removePantryItem({ itemId });
        setItems((prev) => prev.filter((p) => p.id !== itemId));
        setWriteStatus('idle');
      } catch (err) {
        setWriteStatus('error');
        setError(err instanceof Error ? err.message : 'Pantry remove failed.');
      }
    },
    [],
  );

  const markUsed = useCallback(async (ingredientNames: string[]) => {
    if (ingredientNames.length === 0) return;
    setWriteStatus('saving');
    try {
      await agentClient.markPantryItemsUsed({ ingredientNames });
      setWriteStatus('idle');
    } catch (err) {
      setWriteStatus('error');
      setError(err instanceof Error ? err.message : 'Pantry bump failed.');
    }
  }, []);

  return { items, loading, error, writeStatus, add, remove, markUsed, demoMode: demo };
};

const mergeItems = (
  existing: PantryItem[],
  next: PantryItem[],
): PantryItem[] => {
  const byId = new Map<string, PantryItem>();
  for (const p of existing) byId.set(p.id, p);
  for (const p of next) byId.set(p.id, p);
  return Array.from(byId.values()).sort(
    (a, b) => b.addedAt.localeCompare(a.addedAt),
  );
};
