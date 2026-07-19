/**
 * Server-side rate-limit bookkeeping.
 *
 * Reads/writes `generationUsage/{uid}/periods/{periodId}` counters using
 * FirestoreAdmin. Clients cannot modify their own counters (rules deny).
 */
import { getFirestore } from 'firebase-admin/firestore';

import { config } from '../config/index.js';

const db = getFirestore();

export const checkRateLimit = async (
  uid: string,
  kind: 'plan' | 'recipe',
): Promise<void> => {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const ref = db.collection('generationUsage').doc(uid).collection('periods').doc(`${today}-${kind}`);

  const limit = kind === 'plan' ? config.rateLimits.fullPlanPerDay : config.rateLimits.recipeRegenPerDay;
  const cooldownSec = config.rateLimits.fullPlanCooldownSeconds;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() ?? {}) : {};
    const count: number = typeof data.count === 'number' ? data.count : 0;
    const lastAt: number = typeof data.lastAt === 'number' ? data.lastAt : 0;

    const now = Date.now();
    if (kind === 'plan' && lastAt && (now - lastAt) / 1000 < cooldownSec) {
      throw new Error(`RATE_LIMIT_COOLDOWN_${cooldownSec}`);
    }
    if (count >= limit) {
      throw new Error(`RATE_LIMIT_DAILY_${limit}`);
    }
    tx.set(ref, {
      count: count + 1,
      lastAt: now,
      uid,
      kind,
      period: today,
    }, { merge: true });
  });
};
