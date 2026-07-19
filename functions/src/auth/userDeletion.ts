/**
 * Account-deletion callable and Auth trigger.
 *
 * `purgeUserData` deletes `users/{uid}`, every `mealPlans/{planId}` owned
 * by the user (and their subcollections), the user's `publicShares`, and
 * `generationUsage/{uid}/periods/*`.
 *
 * As defense-in-depth, an `auth.user().onDelete()` background trigger
 * repeats the cleanup so even a client crash before the callable returns
 * is handled.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { auth } from 'firebase-functions/v1';
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

const ONE = 500; // Firestore batch ceiling

async function deleteCollection(query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData>) {
  while (true) {
    const snap = await query.limit(ONE).get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

async function purgeAll(uid: string): Promise<void> {
  // Top-level user profile
  await db.collection('users').doc(uid).delete().catch(() => undefined);

  // mealPlans owned by uid, plus subcollections
  const plansSnap = await db
    .collection('mealPlans')
    .where('ownerId', '==', uid)
    .get();
  for (const planDoc of plansSnap.docs) {
    const recipesQ = planDoc.ref.collection('recipes');
    const itemsQ = planDoc.ref.collection('shoppingItems');
    await deleteCollection(recipesQ);
    await deleteCollection(itemsQ);
    await planDoc.ref.delete();
  }

  // Active or revoked shares owned by uid
  const sharesQ = db.collection('publicShares').where('ownerId', '==', uid);
  await deleteCollection(sharesQ);

  // Usage counter periods
  const periodsQ = db.collection('generationUsage').doc(uid).collection('periods');
  await deleteCollection(periodsQ);
  await db.collection('generationUsage').doc(uid).delete().catch(() => undefined);
}

export const purgeUserData = onCall(
  { enforceAppCheck: true },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in to delete account.');
    try {
      await purgeAll(uid);
      return { purged: true };
    } catch (err) {
      console.error('[purgeUserData]', err);
      throw new HttpsError('internal', 'Could not delete user data.');
    }
  },
);

/**
 * Background cleanup hook. Runs *after* the Auth deletion succeeds so the
 * user docs being purged still belong to a known uid (no race with the
 * blocking delete). Retries automatically.
 *
 * `auth.user().onDelete` is the v1 chaining API — it's still the
 * documented path for post-event auth triggers in firebase-functions v6
 * because v2 simplified away from post-events to blocking-only triggers.
 */
export const onAuthUserDeleted = auth.user().onDelete(async (user) => {
  const uid = user.uid;
  if (!uid) return;
  try {
    await purgeAll(uid);
  } catch (err) {
    console.error('[onAuthUserDeleted]', err);
    throw err;
  }
});
