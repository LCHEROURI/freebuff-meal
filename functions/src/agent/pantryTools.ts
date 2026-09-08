/**
 * The 4 pantry onCall handlers (PR #43, ambient voice pantry).
 *
 *  - `addPantryItems`  — bulk upsert the cook's pantry from a single
 *                        voice utterance (after `extractIngredients`).
 *  - `listPantryItems` — read the cook's recent items; the client
 *                        `usePantryItems` hook uses an `onSnapshot`
 *                        listener for live updates instead.
 *  - `removePantryItem` — explicit removal by id.
 *  - `markPantryItemsUsed` — bumps `timesUsed` + `lastUsedAt` for rows
 *                        whose `normalizedName` matches an ingredient
 *                        name in a freshly generated plan.
 *
 * All four obey the same `requireUid` pattern + schema-driven
 * validation as the existing cooking-agent onCalls in
 * `cookingTools.ts`. App Check is enforced; no `enforceAppCheck`
 * exception is needed because pantry is part of the cook's workspace,
 * not a public entrypoint.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { z } from 'zod';

import {
  PantryItemSchema,
  PantryItemConditionSchema,
  normalizePantryName,
} from '../ai/schemas/pantry.js';

import {
  listPantryItems,
  markPantryItemsUsed,
  removePantryItem,
  upsertPantryItems,
} from './pantryStore.js';

const apiKey = defineSecret('GOOGLE_API_KEY');
const PANTRY_GUARD = { enforceAppCheck: true, secrets: [apiKey] };

/** Strict auth wrapper mirroring the cooking-tools convention. */
const requireUid = (req: { auth?: { uid?: string } }): string => {
  const uid = req.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in to manage your pantry.');
  }
  return uid;
};

// =====================================================================
//  add_pantry_items
// =====================================================================
const AddPantryItemInputSchema = z.object({
  name: z.string().min(1).max(80),
  quantity: z.number().positive().nullable(),
  unit: z.string().min(1).max(40).nullable(),
  condition: PantryItemConditionSchema.nullable(),
  confidence: z.number().min(0).max(1).default(0.6),
  note: z.string().max(200).nullable().optional(),
});
const AddPantryItemsRequestSchema = z.object({
  items: z.array(AddPantryItemInputSchema).min(1).max(40),
  source: z.enum(['voice', 'manual']).default('voice'),
});
const AddPantryItemsResponseSchema = z.object({
  items: z.array(PantryItemSchema),
  savedAt: z.string().datetime(),
});

export const addPantryItems = onCall(PANTRY_GUARD, async (req) => {
  const uid = requireUid(req);
  const parsed = AddPantryItemsRequestSchema.safeParse(req.data);
  if (!parsed.success) {
    throw new HttpsError(
      'invalid-argument',
      `Invalid pantry write: ${parsed.error.issues[0]?.message ?? 'unknown error'}`,
    );
  }
  const now = new Date().toISOString();
  const out = await upsertPantryItems(
    uid,
    parsed.data.items.map((it) => ({
      name: it.name,
      normalizedName: normalizePantryName(it.name),
      quantity: it.quantity,
      unit: it.unit,
      condition: it.condition,
      source: parsed.data.source,
      confidence: it.confidence,
      addedAt: now, // placeholder; upsert keeps existing `addedAt`
      lastUsedAt: null,
      timesUsed: 0,
      note: it.note ?? null,
    })),
  );
  return AddPantryItemsResponseSchema.parse({
    items: out,
    savedAt: now,
  });
});

// =====================================================================
//  list_pantry_items
// =====================================================================
const ListPantryItemsRequestSchema = z.object({
  limit: z.number().int().positive().max(80).default(50),
});
const ListPantryItemsResponseSchema = z.object({
  items: z.array(PantryItemSchema),
  fetchedAt: z.string().datetime(),
});

export const listPantryItemsCallable = onCall(PANTRY_GUARD, async (req) => {
  const uid = requireUid(req);
  const parsed = ListPantryItemsRequestSchema.safeParse(req.data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Pagination limit is out of range.');
  }
  const items = await listPantryItems(uid, parsed.data.limit);
  return ListPantryItemsResponseSchema.parse({
    items,
    fetchedAt: new Date().toISOString(),
  });
});

// =====================================================================
//  remove_pantry_item
// =====================================================================
const RemovePantryItemRequestSchema = z.object({
  itemId: z.string().min(1).max(80),
});
const RemovePantryItemResponseSchema = z.object({
  itemId: z.string(),
  removedAt: z.string().datetime(),
});

export const removePantryItemCallable = onCall(PANTRY_GUARD, async (req) => {
  const uid = requireUid(req);
  const parsed = RemovePantryItemRequestSchema.safeParse(req.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Missing itemId.');
  }
  await removePantryItem(uid, parsed.data.itemId);
  return RemovePantryItemResponseSchema.parse({
    itemId: parsed.data.itemId,
    removedAt: new Date().toISOString(),
  });
});

// =====================================================================
//  mark_pantry_items_used
// =====================================================================
const MarkPantryItemsUsedRequestSchema = z.object({
  ingredientNames: z.array(z.string().min(1).max(80)).min(1).max(40),
});
const MarkPantryItemsUsedResponseSchema = z.object({
  matched: z.number().int().nonnegative(),
  touchedAt: z.string().datetime(),
});

export const markPantryItemsUsedCallable = onCall(PANTRY_GUARD, async (req) => {
  const uid = requireUid(req);
  const parsed = MarkPantryItemsUsedRequestSchema.safeParse(req.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'ingredientNames list is required.');
  }
  const { matched } = await markPantryItemsUsed(uid, parsed.data.ingredientNames);
  return MarkPantryItemsUsedResponseSchema.parse({
    matched,
    touchedAt: new Date().toISOString(),
  });
});
