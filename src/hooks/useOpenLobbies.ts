import { useEffect, useState } from 'react';
import { subscribeToOpenLobbies } from '@/services/firebase/lobbyService';
import type { Lobby } from '@/types/lobby';

interface UseOpenLobbiesResult {
  lobbies: Lobby[];
  loading: boolean;
  error: string | null;
}

/**
 * Subscribes to the live list of open lobbies. Cleans up on unmount.
 */
export function useOpenLobbies(): UseOpenLobbiesResult {
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToOpenLobbies(
      (next) => {
        setLobbies(next);
        setLoading(false);
      },
      (err) => {
        console.error('subscribeToOpenLobbies failed:', err);
        setError('Lobiler yüklenemedi.');
        setLoading(false);
      },
    );
    return unsubscribe;
  }, []);

  return { lobbies, loading, error };
}
