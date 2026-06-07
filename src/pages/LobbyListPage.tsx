import { Link } from 'react-router-dom';
import { useOpenLobbies } from '@/hooks/useOpenLobbies';
import { useActiveLobby } from '@/hooks/useActiveLobby';
import { LobbyCard } from '@/components/LobbyCard';
import { ActiveLobbyBanner } from '@/components/ActiveLobbyBanner';

/**
 * Home page: live list of open lobbies (real-time from Firestore), plus a way
 * into lobby creation.
 */
export function LobbyListPage() {
  const { lobbies, loading, error } = useOpenLobbies();
  const activeLobbyId = useActiveLobby();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Lobiler</h1>
        <Link
          to="/create"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Lobi Oluştur
        </Link>
      </div>

      {activeLobbyId && <ActiveLobbyBanner lobbyId={activeLobbyId} />}

      {loading && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Yükleniyor…</p>
      )}

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {!loading && !error && lobbies.length === 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-600 dark:border-felt-800 dark:bg-felt-900 dark:text-zinc-400">
          Henüz açık lobi yok. İlk lobiyi sen oluştur.
        </div>
      )}

      {!loading && !error && lobbies.length > 0 && (
        <div className="space-y-3">
          {lobbies.map((lobby) => (
            <LobbyCard key={lobby.id} lobby={lobby} />
          ))}
        </div>
      )}
    </div>
  );
}
