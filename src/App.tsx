import { useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useAuthListener } from '@/hooks/useAuthListener';
import { useAuthStore } from '@/store/authStore';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserMenu } from '@/components/UserMenu';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { CreateLobbyForm } from '@/components/CreateLobbyForm';
import { createLobby } from '@/services/firebase/lobbyService';
import { getLobbyErrorMessage } from '@/constants/firestoreErrors';
import type { CreateLobbyInput } from '@/types/lobby';

function App() {
  // Bind theme and auth state to the app once at the root.
  useTheme();
  useAuthListener();

  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);

  const [createdLobbyId, setCreatedLobbyId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleCreateLobby(input: CreateLobbyInput) {
    if (!user) return;
    setCreateError(null);
    setCreatedLobbyId(null);
    try {
      const lobbyId = await createLobby(input, {
        uid: user.uid,
        displayName: user.displayName?.trim() || 'Oyuncu',
      });
      setCreatedLobbyId(lobbyId);
    } catch (err) {
      // Log the raw error so the exact cause is visible in the console.
      console.error('createLobby failed:', err);
      setCreateError(getLobbyErrorMessage(err));
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 transition-colors dark:bg-felt-950 dark:text-zinc-50">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-felt-800">
        <span className="text-lg font-semibold tracking-tight">Ludox</span>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {user && <UserMenu user={user} />}
        </div>
      </header>

      <main className="mx-auto max-w-xl px-6 py-12">
        {status === 'loading' && (
          <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
            Yükleniyor…
          </p>
        )}

        {status === 'unauthenticated' && <AuthScreen />}

        {status === 'authenticated' && user && (
          <>
            <CreateLobbyForm onSubmit={handleCreateLobby} />

            {createdLobbyId && (
              <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-felt-800 dark:bg-felt-900">
                <p className="font-medium text-zinc-800 dark:text-zinc-100">
                  Lobi oluşturuldu.
                </p>
                <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                  ID: <span className="font-mono">{createdLobbyId}</span>
                </p>
              </div>
            )}

            {createError && (
              <p className="mt-6 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                {createError}
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
