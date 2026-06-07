import { useEffect } from 'react';
import { observeAuth } from '@/services/firebase/authService';
import { useAuthStore } from '@/store/authStore';

/**
 * Subscribes the auth store to Firebase auth state changes. Call once near the
 * app root. Cleans up the subscription on unmount.
 */
export function useAuthListener(): void {
  const setUser = useAuthStore((state) => state.setUser);

  useEffect(() => {
    const unsubscribe = observeAuth(setUser);
    return unsubscribe;
  }, [setUser]);
}
