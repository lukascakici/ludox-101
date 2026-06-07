import { create } from 'zustand';
import type { User } from 'firebase/auth';

/**
 * `loading`        — initial auth state not resolved yet.
 * `authenticated`  — a user (guest or registered) is signed in.
 * `unauthenticated`— no user signed in.
 */
export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  user: User | null;
  status: AuthStatus;
  /** Set from the auth listener whenever Firebase reports a state change. */
  setUser: (user: User | null) => void;
}

/**
 * Global auth store. Holds the current Firebase user and a derived status.
 * Mutated only by the auth listener (see `useAuthListener`); components read
 * from it via selectors.
 */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'loading',
  setUser: (user) =>
    set({ user, status: user ? 'authenticated' : 'unauthenticated' }),
}));
