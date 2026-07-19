import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, type Firestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, type Functions, connectFunctionsEmulator } from 'firebase/functions';
import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from 'firebase/app-check';

import { env, isFirebaseConfigured } from '../env';

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let functions: Functions | undefined;
let appCheck: AppCheck | undefined;
let initialized = false;

const config = {
  apiKey: env.firebaseApiKey,
  authDomain: env.firebaseAuthDomain,
  projectId: env.firebaseProjectId,
  appId: env.firebaseAppId,
  storageBucket: env.firebaseStorageBucket,
  messagingSenderId: env.firebaseMessagingSenderId,
  measurementId: env.firebaseMeasurementId,
};

/**
 * Idempotent init. Returns undefined when Firebase isn't configured so
 * the rest of the app can pivot to demo mode.
 */
export const initFirebase = (): void => {
  if (initialized) return;
  if (!isFirebaseConfigured()) {
    console.warn(
      '[firebase] Missing config; running in demo mode (localStorage only).',
    );
    initialized = true;
    return;
  }

  app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
  functions = getFunctions(app);

  if (env.appCheckSiteKey) {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(env.appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }

  if (env.useEmulators) {
    if (auth) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    if (db) connectFirestoreEmulator(db, '127.0.0.1', 8080);
    if (functions) connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  }

  initialized = true;
};

export const getFirebaseApp = (): FirebaseApp | undefined => app;
export const getFirebaseAuth = (): Auth | undefined => auth;
export const getDb = (): Firestore | undefined => db;
export const getFunctionsInstance = (): Functions | undefined => functions;
export const getAppCheck = (): AppCheck | undefined => appCheck;
