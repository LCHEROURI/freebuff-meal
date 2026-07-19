/**
 * Sharing service.
 *
 * In production: uses callable Cloud Functions (`createShare`, `revokeShare`)
 * that write a redacted snapshot to `publicShares/{shareId}`.
 *
 * In demo mode: persists the snapshot to `localStorage` so the same flow
 * remains walkable without a Firebase project.
 */
import { httpsCallable } from 'firebase/functions';

import { getFirebaseAuth, getFunctionsInstance } from '@/lib/firebase/app';
import { isFirebaseConfigured } from '@/lib/env';
import type { DemoMealPlan } from '@/utils/demoAdapter';

const SHARE_KEY = 'demo:share:';

type Snapshot = {
  planName: string;
  summary: string;
  generatedAt?: string;
  recipes: unknown[];
};

const generateShareId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `share-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const createShare = async (plan: DemoMealPlan): Promise<string> => {
  if (!isFirebaseConfigured()) {
    const id = generateShareId();
    const snapshot: Snapshot = {
      planName: plan.name,
      summary: plan.summary,
      generatedAt: plan.createdAt,
      recipes: plan.recipes,
    };
    try {
      window.localStorage.setItem(`${SHARE_KEY}${id}`, JSON.stringify(snapshot));
    } catch {
      /* ignore */
    }
    return `${window.location.origin}/share/${id}`;
  }
  const auth = getFirebaseAuth();
  if (!auth?.currentUser) throw new Error('Sign in to share a plan.');
  const fns = getFunctionsInstance();
  if (!fns) throw new Error('Backend unavailable.');
  const call = httpsCallable<{ planId: string }, { shareId: string }>(fns, 'createShare');
  const out = await call({ planId: plan.id });
  return `${window.location.origin}/share/${out.data.shareId}`;
};

export const revokeShare = async (shareId: string): Promise<void> => {
  if (!isFirebaseConfigured()) {
    try {
      window.localStorage.removeItem(`${SHARE_KEY}${shareId}`);
      return;
    } catch {
      /* ignore */
    }
  }
  const fns = getFunctionsInstance();
  if (!fns) throw new Error('Backend unavailable.');
  const call = httpsCallable<{ shareId: string }, { revoked: boolean }>(fns, 'revokeShare');
  await call({ shareId });
};
