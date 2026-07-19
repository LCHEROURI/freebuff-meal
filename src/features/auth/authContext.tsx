/**
 * Auth context that wraps Firebase Auth. When Firebase isn't configured
 * (demo mode), it falls back to a single local "demo user" so all flows
 * remain walkable end-to-end without any external services.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut as fbSignOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';

import { getFirebaseAuth, initFirebase } from '@/lib/firebase/app';
import { env, isFirebaseConfigured } from '@/lib/env';
import { ensureProfile } from '@/utils/demoAdapter';
import { deleteCurrentAccount } from './userAccountService';

export type AuthUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
  isAnonymous?: boolean;
  source: 'firebase' | 'demo';
};

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  isDemo: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  verifyEmail: () => Promise<void>;
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);
const DEMO_USER_KEY = 'demo:user';

const readDemoUser = (): AuthUser | null => {
  try {
    const raw = window.localStorage.getItem(DEMO_USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
};

const writeDemoUser = (user: AuthUser | null): void => {
  try {
    if (user) {
      window.localStorage.setItem(DEMO_USER_KEY, JSON.stringify(user));
    } else {
      window.localStorage.removeItem(DEMO_USER_KEY);
    }
  } catch {
    /* ignore */
  }
};

const toAuthUser = (u: FirebaseUser): AuthUser => ({
  uid: u.uid,
  email: u.email,
  displayName: u.displayName,
  emailVerified: u.emailVerified,
  isAnonymous: u.isAnonymous,
  source: 'firebase',
});

const genericAuthError = (err: unknown): Error => {
  // Surface specific but safe messages (we do NOT reveal whether an email
  // exists for sign-in, but password reset can confirm per Firebase guidance).
  if (typeof err === 'object' && err && 'code' in err) {
    const code = (err as { code: string }).code;
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
      return new Error('Those credentials do not match our records.');
    }
    if (code === 'auth/too-many-requests') {
      return new Error('Too many attempts. Please try again later.');
    }
  }
  return new Error('Authentication failed. Please try again.');
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const isDemo = !isFirebaseConfigured() || env.demoMode;

  useEffect(() => {
    initFirebase();
    if (isDemo) {
      const existing = readDemoUser();
      if (existing) {
        ensureProfile(existing.uid);
        setUser(existing);
      }
      setLoading(false);
      return;
    }
    const auth = getFirebaseAuth();
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ? toAuthUser(u) : null);
      setLoading(false);
    });
    return () => unsub();
  }, [isDemo]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (isDemo) {
        const demoUser: AuthUser = {
          uid: 'demo-user',
          email,
          displayName: 'Demo Cook',
          emailVerified: true,
          source: 'demo',
        };
        ensureProfile(demoUser.uid);
        writeDemoUser(demoUser);
        setUser(demoUser);
        return;
      }
      try {
        const auth = getFirebaseAuth()!;
        await signInWithEmailAndPassword(auth, email, password);
      } catch (err) {
        throw genericAuthError(err);
      }
    },
    [isDemo],
  );

  const signUp = useCallback(
    async (email: string, password: string, displayName: string) => {
      if (isDemo) {
        const demoUser: AuthUser = {
          uid: 'demo-user',
          email,
          displayName,
          emailVerified: true,
          source: 'demo',
        };
        ensureProfile(demoUser.uid);
        writeDemoUser(demoUser);
        setUser(demoUser);
        return;
      }
      try {
        const auth = getFirebaseAuth()!;
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        if (displayName) {
          await updateProfile(cred.user, { displayName });
        }
        await sendEmailVerification(cred.user);
      } catch (err) {
        throw genericAuthError(err);
      }
    },
    [isDemo],
  );

  const signInWithGoogle = useCallback(async () => {
    if (isDemo) {
      const demoUser: AuthUser = {
        uid: 'demo-user',
        email: 'demo@local',
        displayName: 'Demo Cook',
        emailVerified: true,
        source: 'demo',
      };
      ensureProfile(demoUser.uid);
      writeDemoUser(demoUser);
      setUser(demoUser);
      return;
    }
    try {
      const auth = getFirebaseAuth()!;
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      throw genericAuthError(err);
    }
  }, [isDemo]);

  const resetPassword = useCallback(
    async (email: string) => {
      if (isDemo) {
        return;
      }
      try {
        const auth = getFirebaseAuth()!;
        await sendPasswordResetEmail(auth, email);
      } catch (err) {
        throw genericAuthError(err);
      }
    },
    [isDemo],
  );

  const signOut = useCallback(async () => {
    if (isDemo) {
      writeDemoUser(null);
      setUser(null);
      return;
    }
    const auth = getFirebaseAuth()!;
    await fbSignOut(auth);
  }, [isDemo]);

  const verifyEmail = useCallback(async () => {
    if (isDemo) return;
    const auth = getFirebaseAuth();
    if (!auth?.currentUser) return;
    await sendEmailVerification(auth.currentUser);
  }, [isDemo]);

  const deleteAccount = useCallback(async () => {
    try {
      await deleteCurrentAccount();
      writeDemoUser(null);
      setUser(null);
    } catch (err) {
      // Firebase requires recent login before deleteUser(); surface a friendly message.
      throw err instanceof Error ? err : new Error('Could not delete account.');
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      isDemo,
      signIn,
      signUp,
      signInWithGoogle,
      resetPassword,
      signOut,
      verifyEmail,
      deleteAccount,
    }),
    [
      user,
      loading,
      isDemo,
      signIn,
      signUp,
      signInWithGoogle,
      resetPassword,
      signOut,
      verifyEmail,
      deleteAccount,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthState => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
