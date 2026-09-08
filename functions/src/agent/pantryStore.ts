/**
 * Per-user pantry-item Firestore CRUD.
 *
 * Single source of truth for writes/reads across the 4 cooking-agent
 * pantry onCalls. The docs live at `pantryItems/{itemId}` and the
 * identity is `(ownerId, normalizedName, condition)` — a "frozen
 * chicken" and a "fresh chicken" are *different* pantry rows. That
 * means the same cook can have both, and the dedup logic at the
 * onCall boundary uses them as a composite key.
 *
 * Reads/writes use the Admin SDK so the onCall handlers bypass the
 * client-level Firestore rules. The client-side `onSnapshot`
 * listener in `usePantryItems` reads through the user's own session
 * token via the existing `isOwner(ownerId)` rule.
 */
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

import { PantryItemSchema, dedupeKey, type PantryItem } from '../ai/schemas/pantry.js';

const db = getFirestore();

const COLLECTION = 'pantryItems';

/**
 * Find an existing pantry item by its identity key. Returns null when
 * no row exists — caller creates a new doc instead of merging into a
 * stale one.
 */
export const findPantryItem = async (
  ownerId: string,
  normalizedName: string,
  condition: PantryItem['condition'],
): Promise<PantryItem | null> => {
  const key = dedupeKey(ownerId, normalizedName, condition);
  const snap = await db
    .collection(COLLECTION)
    .where('ownerId', '==', ownerId)
    .where('dedupeKey', '==', key)
    .limit(1)
    .get();
  const doc = snap.docs[0];
  if (!doc) return null;
  const data = doc.data() as PantryItem;
  // Defense in depth: every read passes through Zod to catch silent
  // server-side drift. (Cheap because the schema is small.)
  const parsed = PantryItemSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
};

/**
 * Bulk-write items. Existing rows with the same identity key are
 * upserted (so re-saying "chicken" doesn't create duplicate docs).
 * New items get a fresh `addedAt`.
 *
 * Returns the canonical list of (created | updated) items in the
 * same iteration order as the input.
 */
export const upsertPantryItems = async (
  ownerId: string,
  items: Omit<PantryItem, 'id' | 'ownerId' | 'addedAt'>[],
): Promise<PantryItem[]> => {
  const out: PantryItem[] = [];
  const now = new Date().toISOString();
  const batch = db.batch();
  for (const partial of items) {
    const dedupe = dedupeKey(ownerId, partial.normalizedName, partial.condition);
    const existing = await findPantryItem(ownerId, partial.normalizedName, partial.condition);
    const ref = existing
      ? db.collection(COLLECTION).doc(existing.id)
      : db.collection(COLLECTION).doc();
    const merged: PantryItem = existing
      ? {
          ...existing,
          name: partial.name,
          quantity: partial.quantity ?? existing.quantity,
          unit: partial.unit ?? existing.unit,
          confidence: Math.max(partial.confidence, existing.confidence),
          note: partial.note ?? existing.note,
        }
      : {
          id: ref.id,
          ownerId,
          addedAt: now,
          // `partial` carries `lastUsedAt` and `timesUsed` already
          // (the caller is the onCall trust-boundary; the request
          // schema forces both to null/0 for new rows). Listing them
          // explicitly here would be a duplicate-key lint error and
          // adds nothing — the spread is the canonical source.
          ...partial,
        };
    batch.set(ref, { ...merged, dedupeKey: dedupe });
    out.push(merged);
  }
  await batch.commit();
  return out;
};

export const listPantryItems = async (
  ownerId: string,
  limitN = 50,
): Promise<PantryItem[]> => {
  const snap = await db
    .collection(COLLECTION)
    .where('ownerId', '==', ownerId)
    .orderBy('addedAt', 'desc')
    .limit(limitN)
    .get();
  return snap.docs
    .map((d) => d.data() as PantryItem)
    .filter((doc): doc is PantryItem => PantryItemSchema.safeParse(doc).success);
};

export const removePantryItem = async (
  ownerId: string,
  itemId: string,
): Promise<void> => {
  const ref = db.collection(COLLECTION).doc(itemId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() as PantryItem | undefined;
  if (!data || data.ownerId !== ownerId) return; // defense in depth
  await ref.delete();
};

/**
 * Bump `timesUsed` + `lastUsedAt` on every pantry row whose
 * `normalizedName` matches an ingredient name the cook's plan is
 * about to use. Match is case-insensitive AND condition-aware: we
 * only bump rows whose `condition` is non-null *and* matches. Plain
 * (no-condition) rows are bumped on every match because the cook
 * usually doesn't track fresh-vs-frozen for staples.
 *
 * Returns the count of rows touched. Caller can use this for a soft
 * UI hint ("you used 3 pantry items this week").
 */
export const markPantryItemsUsed = async (
  ownerId: string,
  ingredientNames: string[],
): Promise<{ matched: number; items: PantryItem[] }> => {
  if (ingredientNames.length === 0) return { matched: 0, items: [] };
  const normalized = ingredientNames
    .map((n) => n.toLowerCase().trim())
    .filter((n) => n.length > 0);

  const snap = await db
    .collection(COLLECTION)
    .where('ownerId', '==', ownerId)
    .get();
  const candidates = snap.docs
    .map((d) => d.data() as PantryItem)
    .filter((doc): doc is PantryItem => PantryItemSchema.safeParse(doc).success)

    .filter(
      (doc) =>
        doc.condition === null || doc.note === null || doc.note.length > 0
          ? true
          : false,
    );

  const matched: PantryItem[] = [];
  const batch = db.batch();
  const now = new Date().toISOString();
  for (const doc of candidates) {
    const hit = normalized.some((n) => {
      if (n === doc.normalizedName) return true;
      // Tolerate a singular/plural one letter apart — "tomato" / "tomatoes" —
      // by checking substring inclusion in both directions.
      if (doc.normalizedName.includes(n) || n.includes(doc.normalizedName)) return true;
      return false;
    });
    if (!hit) continue;
    matched.push(doc);
    batch.update(db.collection(COLLECTION).doc(doc.id), {
      timesUsed: FieldValue.increment(1),
      lastUsedAt: now,
    });
  }
  if (matched.length > 0) await batch.commit();
  return { matched: matched.length, items: matched };
};
