import { useEffect, useState } from 'react';
import { subscribeToActiveLobby } from '@/services/firebase/lobbyService';
import { useAuthStore } from '@/store/authStore';

/**
 * Live id of the lobby the current user is already in (or `null`). Used to
 * enforce one-active-lobby-per-user and to surface a "you're already in a
 * lobby" banner.
 */
export function useActiveLobby(): string | null {
  const uid = useAuthStore((s) => s.user?.uid);
  const [activeLobbyId, setActiveLobbyId] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setActiveLobbyId(null);
      return;
    }
    return subscribeToActiveLobby(uid, setActiveLobbyId);
  }, [uid]);

  return activeLobbyId;
}
