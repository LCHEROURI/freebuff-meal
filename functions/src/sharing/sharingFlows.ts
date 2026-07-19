/**
 * Sharing callables.
 *
 * `createShare` snapshots a plan and writes a redacted, read-only entry to
 * `publicShares/{shareId}` so external browsers can view it without seeing
 * the owner's profile or free-text request.
 *
 * `revokeShare` flips `isActive` to false. The Firestore rule degrades the
 * `get` policy to deny once revoked.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { PublicPlanSnapshotSchema } from '../ai/schemas/index.js';

const db = getFirestore();

const CreateShareInputSchema = z.object({ planId: z.string().min(1) });

export const createShare = onCall(
  { enforceAppCheck: true },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in to share.');

    try {
      const { planId } = CreateShareInputSchema.parse(request.data);
      const planSnap = await db
        .collection('mealPlans')
        .doc(planId)
        .get();
      if (!planSnap.exists) {
        throw new HttpsError('not-found', 'Plan not found.');
      }
      const plan = planSnap.data() as Record<string, unknown>;
      if (plan.ownerId !== uid) {
        throw new HttpsError('permission-denied', 'Not your plan.');
      }
      const planName = String(plan.name ?? 'Plan');
      const summary = String(plan.summary ?? '');
      const generatedAt =
        typeof plan.createdAt === 'string' ? plan.createdAt : new Date().toISOString();
      const recipes = Array.isArray(plan.recipes)
        ? (plan.recipes as unknown[])
        : [];

      const shareId = randomUUID();
      const safe = PublicPlanSnapshotSchema.parse({
        planName,
        summary,
        generatedAt,
        recipes,
      });

      await db.collection('publicShares').doc(shareId).set({
        ownerId: uid,
        planId,
        isActive: true,
        publicPlanSnapshot: safe,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
        revokedAt: null,
      });      return { shareId };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      if (err instanceof z.ZodError) {
        throw new HttpsError('invalid-argument', 'Invalid share request.');
      }
      console.error('[createShare]', err);
      throw new HttpsError('internal', 'Could not create share link.');
    }
  },
);

const RevokeShareInputSchema = z.object({ shareId: z.string().min(8) });

export const revokeShare = onCall(
  { enforceAppCheck: true },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in to revoke.');

    try {
      const { shareId } = RevokeShareInputSchema.parse(request.data);
      const ref = db.collection('publicShares').doc(shareId);
      const snap = await ref.get();
      if (!snap.exists) throw new HttpsError('not-found', 'Share not found.');
      const data = snap.data() ?? {};
      if (data.ownerId !== uid) {
        throw new HttpsError('permission-denied', 'Not your share.');
      }
      await ref.update({
        isActive: false,
        revokedAt: new Date().toISOString(),
      });
      return { revoked: true };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      if (err instanceof z.ZodError) {
        throw new HttpsError('invalid-argument', 'Invalid revoke request.');
      }
      console.error('[revokeShare]', err);
      throw new HttpsError('internal', 'Could not revoke share link.');
    }
  },
);
