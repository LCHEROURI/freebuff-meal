/**
 * Centralized helpers for reading env vars safely. Each `getEnv*` returns
 * undefined when unset so callers can decide how to fall back (e.g. demo mode).
 */

const isTrue = (val: string | undefined): boolean => val === 'true' || val === '1';

export const env = {
  firebaseApiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  firebaseAuthDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  firebaseProjectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  firebaseAppId: import.meta.env.VITE_FIREBASE_APP_ID,
  firebaseStorageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  firebaseMessagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  firebaseMeasurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  appCheckSiteKey: import.meta.env.VITE_APP_CHECK_SITE_KEY,
  useEmulators: isTrue(import.meta.env.VITE_USE_EMULATORS),
  useFunctionsEmulator: isTrue(import.meta.env.VITE_USE_FUNCTIONS_EMULATOR),
  demoMode: isTrue(import.meta.env.VITE_DEMO_MODE),
};

/**
 * Whether the client has everything it needs to talk to real Firebase.
 * When this is false, the app falls back to `demoMode` (localStorage-backed)
 * so the UI is still exercisable.
 */
export const isFirebaseConfigured = (): boolean =>
  Boolean(
    env.firebaseApiKey &&
      env.firebaseAuthDomain &&
      env.firebaseProjectId &&
      env.firebaseAppId,
  );
