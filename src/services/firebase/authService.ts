import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
  type Unsubscribe,
} from 'firebase/auth';
import { auth } from './config';

export type { User };

/**
 * Subscribes to auth state changes. Returns an unsubscribe function.
 * Used once at the app root to keep the auth store in sync.
 */
export function observeAuth(callback: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, callback);
}

/**
 * Signs in as a guest (anonymous) with a chosen nickname. Anonymous users get
 * no persistent history but can later be linked to a permanent account.
 */
export async function signInAsGuest(displayName: string): Promise<User> {
  const credential = await signInAnonymously(auth);
  await updateProfile(credential.user, { displayName: displayName.trim() });
  return credential.user;
}

/** Creates a permanent account with email/password and sets the display name. */
export async function registerWithEmail(
  email: string,
  password: string,
  displayName: string,
): Promise<User> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName: displayName.trim() });
  return credential.user;
}

/** Signs in to an existing email/password account. */
export async function signInWithEmail(
  email: string,
  password: string,
): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

/** Signs the current user out. */
export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}
