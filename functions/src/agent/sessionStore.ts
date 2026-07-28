/**
 * Cooking-session Firestore CRUD.
 *
 * Single source of truth for writes/reads across the 15 cooking-agent
 * tools. The docs live at `cookingSessions/{sessionId}` and the
 * event-log lives at `cookingSessions/{sessionId}/events/{eventId}`.
 *
 * Reads/writes use the Admin SDK so the onCall handlers can bypass
 * the client-level Firestore rules (rules still apply to any direct
 * client writes — clients see only their own sessions via
 * `ownerId isOwner`).
 */
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

import type { CookingSession } from './schemas.js';

const db = getFirestore();

const COLLECTION = 'cookingSessions';
const EVENT_COLLECTION = 'cooking_session_events';

export const getSession = async (
  ownerId: string,
  sessionId: string,
): Promise<CookingSession | null> => {
  const snap = await db.collection(COLLECTION).doc(sessionId).get();
  if (!snap.exists) return null;
  const data = snap.data() as CookingSession | undefined;
  if (!data) return null;
  if (data.ownerId !== ownerId) {
    // Defense in depth: rules already enforce this, but a stray shared
    // session from a sibling project could still surface here.
    return null;
  }
  return data;
};

export const listActiveSessions = async (
  ownerId: string,
): Promise<CookingSession[]> => {
  const snap = await db
    .collection(COLLECTION)
    .where('ownerId', '==', ownerId)
    .where('status', 'in', ['active', 'paused'])
    .orderBy('lastActivityAt', 'desc')
    .limit(5)
    .get();
  return snap.docs.map((d) => d.data() as CookingSession);
};

export const createSession = async (session: CookingSession): Promise<void> => {
  await db.collection(COLLECTION).doc(session.id).set(session);
};

export const updateSession = async (
  sessionId: string,
  partial: Partial<CookingSession>,
): Promise<CookingSession> => {
  const ref = db.collection(COLLECTION).doc(sessionId);
  await ref.update({
    ...partial,
    lastActivityAt: new Date().toISOString(),
  });
  const snap = await ref.get();
  return snap.data() as CookingSession;
};

export const deleteSession = async (sessionId: string): Promise<void> => {
  await db.collection(COLLECTION).doc(sessionId).delete();
};

export type SessionEventType =
  | 'INGREDIENTS_SAVED'
  | 'INGREDIENTS_UPDATED'
  | 'REQUIREMENTS_COLLECTED'
  | 'RECIPE_GENERATED'
  | 'RECIPE_VALIDATED'
  | 'COOKING_SESSION_STARTED'
  | 'STEP_STARTED'
  | 'STEP_COMPLETED'
  | 'STEP_REPEATED'
  | 'STEP_REVERSED'
  | 'SUBSTITUTION_REQUESTED'
  | 'SUBSTITUTION_RESOLVED'
  | 'TIMER_STARTED'
  | 'TIMER_FINISHED'
  | 'SESSION_PAUSED'
  | 'SESSION_RESUMED'
  | 'SESSION_COMPLETED'
  | 'SESSION_ABANDONED'
  | 'ERROR_OCCURRED'
  | 'AGENT_TOOL_LOG';

export const logEvent = async (
  sessionId: string,
  event: {
    eventType: SessionEventType;
    actor: 'user' | 'agent' | 'system';
    payload?: Record<string, unknown>;
  },
): Promise<void> => {
  await db
    .collection(COLLECTION)
    .doc(sessionId)
    .collection(EVENT_COLLECTION)
    .add({
      sessionId,
      eventType: event.eventType,
      actor: event.actor,
      payload: event.payload ?? {},
      createdAt: new Date().toISOString(),
    });
};

/**
 * Convenience: bump the activity timestamp on a session without
 * touching any other fields (used after logging an event so the client
 * sees a fresh `lastActivityAt` rather than the stale one persisted at
 * the prior write).
 */
export const touchSession = async (sessionId: string): Promise<void> => {
  await db
    .collection(COLLECTION)
    .doc(sessionId)
    .update({ lastActivityAt: FieldValue.serverTimestamp() });
};
