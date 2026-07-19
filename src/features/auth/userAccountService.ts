import {
  EmailAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  deleteUser,
  type AuthError,
} from 'firebase/auth';

import { getFirebaseAuth, getFunctionsInstance } from '@/lib/firebase/app';
import { httpsCallable } from 'firebase/functions';
import { isFirebaseConfigured } from '@/lib/env';

export class ReauthRequiredError extends Error {
  constructor() {
    super('REAUTH_REQUIRED');
  }
}

export type SupportedReauthProvider = 'password' | 'google' | 'apple' | 'unknown';

/**
 * Returns every provider the current user is actually linked to, in a
 * deterministic UI-friendly order: Google → Apple → password (password is
 * listed last because it is the most-invasive fallback).
 */
export const availableReauthMethods = (): SupportedReauthProvider[] => {
  const auth = getFirebaseAuth();
  const u = auth?.currentUser;
  if (!u) return [];
  const ids = new Set(u.providerData.map((p) => p.providerId));
  const out: SupportedReauthProvider[] = [];
  if (ids.has('google.com')) out.push('google');
  if (ids.has('apple.com')) out.push('apple');
  if (ids.has('password')) out.push('password');
  return out;
};

/** Convenience: the first linked provider, or 'unknown' when none is. */
export const detectReauthMethod = (): SupportedReauthProvider =>
  availableReauthMethods()[0] ?? 'unknown';

export const purgeUserData = async (): Promise<void> => {
  if (!isFirebaseConfigured()) {
    try {
      const keys = Object.keys(window.localStorage).filter((k) => k.startsWith('demo:'));
      keys.forEach((k) => window.localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
    return;
  }
  const fns = getFunctionsInstance();
  if (!fns) throw new Error('Backend unavailable.');
  const call = httpsCallable<Record<string, never>, { purged: boolean }>(fns, 'purgeUserData');
  await call({});
};

/**
 * Re-authenticate the current user using the chosen provider. Callers MUST
 * pass a `provider` that is actually linked to the account; the password form
 * requires both email and password opts. Throws on `auth/popup-closed-by-user`,
 * `auth/account-exists-with-different-credential`, and the standard Firebase
 * auth errors so the UI can surface them.
 */
export const reauthenticateCurrentUser = async (opts: {
  provider: SupportedReauthProvider;
  email?: string;
  password?: string;
}): Promise<void> => {
  const auth = getFirebaseAuth();
  if (!auth?.currentUser) {
    throw new ReauthRequiredError();
  }
  // Defensive: never let the UI dispatch on a provider the user is not linked to.
  const linked = new Set(availableReauthMethods());
  if (opts.provider !== 'unknown' && !linked.has(opts.provider)) {
    throw new Error('That sign-in method is not linked to this account.');
  }
  if (opts.provider === 'google') {
    await reauthenticateWithPopup(auth.currentUser, new GoogleAuthProvider());
    return;
  }
  if (opts.provider === 'apple') {
    const provider = new OAuthProvider('apple.com');
    await reauthenticateWithPopup(auth.currentUser, provider);
    return;
  }
  // password (or unknown fallback)
  if (!opts.email || !opts.password) {
    throw new Error('Please re-enter your email and password to continue.');
  }
  const cred = EmailAuthProvider.credential(opts.email, opts.password);
  await reauthenticateWithCredential(auth.currentUser, cred);
};

export const deleteCurrentAccount = async (): Promise<void> => {
  if (!isFirebaseConfigured()) {
    await purgeUserData();
    return;
  }
  const auth = getFirebaseAuth();
  if (!auth?.currentUser) {
    await purgeUserData();
    return;
  }
  await purgeUserData();
  await deleteAuthenticatedUser();
};

export const deleteAuthenticatedUser = async (): Promise<void> => {
  const auth = getFirebaseAuth();
  if (!auth?.currentUser) return;
  try {
    await deleteUser(auth.currentUser);
  } catch (err) {
    const code = (err as AuthError | undefined)?.code;
    if (code === 'auth/requires-recent-login') {
      throw new ReauthRequiredError();
    }
    throw err;
  }
};
