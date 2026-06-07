import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LobbyForm } from '@/components/LobbyForm';
import { ActiveLobbyBanner } from '@/components/ActiveLobbyBanner';
import { createLobby } from '@/services/firebase/lobbyService';
import { getLobbyErrorMessage } from '@/constants/firestoreErrors';
import { useActiveLobby } from '@/hooks/useActiveLobby';
import { useAuthStore } from '@/store/authStore';
import type { CreateLobbyInput } from '@/types/lobby';

/** Page wrapping the create-lobby form; navigates to the lobby on success. */
export function CreateLobbyPage() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const activeLobbyId = useActiveLobby();
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(input: CreateLobbyInput) {
    if (!user) return;
    setError(null);
    try {
      const lobbyId = await createLobby(input, {
        uid: user.uid,
        displayName: user.displayName?.trim() || 'Oyuncu',
      });
      navigate(`/lobby/${lobbyId}`);
    } catch (err) {
      console.error('createLobby failed:', err);
      setError(getLobbyErrorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <Link
        to="/"
        className="inline-block text-sm text-zinc-500 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        ← Lobilere dön
      </Link>

      {activeLobbyId ? (
        <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-6 dark:border-felt-800 dark:bg-felt-900">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Yeni bir lobi açmak için önce mevcut lobinden ayrılmalısın.
          </p>
          <ActiveLobbyBanner lobbyId={activeLobbyId} />
        </div>
      ) : (
        <>
          <LobbyForm mode="create" onSubmit={handleCreate} />

          {error && (
            <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
