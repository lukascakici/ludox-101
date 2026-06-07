import { Link } from 'react-router-dom';
import {
  formatMatchSummary,
  gameModeLabels,
  isLobbyFull,
} from '@/constants/lobby';
import type { Lobby } from '@/types/lobby';

/** A single open lobby in the list. */
export function LobbyCard({ lobby }: { lobby: Lobby }) {
  const isFull = isLobbyFull(lobby);

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-felt-800 dark:bg-felt-900">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-zinc-900 dark:text-zinc-50">
            {lobby.name}
          </span>
          {lobby.settings.isPrivate && (
            <span className="shrink-0 rounded border border-zinc-300 px-1.5 py-0.5 text-xs text-zinc-500 dark:border-felt-700 dark:text-zinc-400">
              Şifreli
            </span>
          )}
        </div>
        <p className="mt-1 truncate text-sm text-zinc-500 dark:text-zinc-400">
          {gameModeLabels[lobby.settings.gameMode]} ·{' '}
          {formatMatchSummary(lobby.settings.matchFormat)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span className="text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
          {lobby.players.length}/{lobby.maxPlayers}
        </span>
        {isFull ? (
          <span className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-400 dark:border-felt-800 dark:text-zinc-500">
            Dolu
          </span>
        ) : (
          <Link
            to={`/lobby/${lobby.id}`}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            Katıl
          </Link>
        )}
      </div>
    </div>
  );
}
