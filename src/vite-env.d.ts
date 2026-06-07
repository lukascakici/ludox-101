/// <reference types="vite/client" />

/**
 * Strongly-typed environment variables (Firebase config).
 * All Vite client env vars must be prefixed with `VITE_`.
 */
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  /** Google Analytics measurement id (optional). */
  readonly VITE_FIREBASE_MEASUREMENT_ID: string;
  /** Realtime Database URL — used for in-game state in a later phase. */
  readonly VITE_FIREBASE_DATABASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
