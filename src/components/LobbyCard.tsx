import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  formatMatchSummary,
  gameModeLabels,
  isLobbyFull,
} from '@/constants/lobby';
import { joinLobby } from '@/services/firebase/lobbyService';
import { getJoinErrorMessage } from '@/constants/joinErrors';
import { useAuthStore } from '@/store/authStore';
import { Input } from '@/components/ui/Input';
import type { Lobby } from '@/types/lobby';

interface LobbyCardProps {
  lobby: Lobby;
  /** The lobby the current user is already in (to adapt the action). */
  activeLobbyId: string | null;
}

/** A single open lobby in the list, with a quick-join action. */
export function LobbyCard({ lobby, activeLobbyId }: LobbyCardProps) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState('');

  const isFull = isLobbyFull(lobby);
  const isMine = activeLobbyId === lobby.id;
  const inAnotherLobby = !!activeLobbyId && activeLobbyId !== lobby.id;
  const isPrivate = lobby.settings.isPrivate;
  const hostName = lobby.players.find((p) => p.isHost)?.displayName;

  async function doJoin() {
    if (!user) return;
    setError(null);
    setJoining(true);
    try {
      await joinLobby(
        lobby.id,
        { uid: user.uid, displayName: user.displayName?.trim() || 'Oyuncu' },
        isPrivate ? password : undefined,
      );
      navigate(`/lobby/${lobby.id}`);
    } catch (err) {
      console.error('joinLobby failed:', err);
      setError(getJoinErrorMessage(err));
      setJoining(false);
    }
  }

  function handleJoinClick() {
    // Private lobbies reveal a password field on first click, then join.
    if (isPrivate && !showPassword) {
      setShowPassword(true);
      return;
    }
    void doJoin();
  }

  function renderAction() {
    if (isMine) {
      return (
        <Link
          to={`/lobby/${lobby.id}`}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-felt-700 dark:text-zinc-200 dark:hover:bg-felt-800"
        >
          Lobine dön
        </Link>
      );
    }
    if (isFull) {
      return (
        <span className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-400 dark:border-felt-800 dark:text-zinc-500">
          Dolu
        </span>
      );
    }
    return (
      <button
        type="button"
        onClick={handleJoinClick}
        disabled={joining || inAnotherLobby}
        title={inAnotherLobby ? 'Zaten başka bir lobidesin' : undefined}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        {joining ? 'Katılınıyor…' : 'Katıl'}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-felt-800 dark:bg-felt-900">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-zinc-900 dark:text-zinc-50">
              {lobby.name}
            </span>
            {isPrivate && (
              <span className="shrink-0 rounded border border-zinc-300 px-1.5 py-0.5 text-xs text-zinc-500 dark:border-felt-700 dark:text-zinc-400">
                Şifreli
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-sm text-zinc-500 dark:text-zinc-400">
            {gameModeLabels[lobby.settings.gameMode]} ·{' '}
            {formatMatchSummary(lobby.settings.matchFormat)}
          </p>
          {hostName && (
            <p className="mt-0.5 truncate text-xs text-zinc-400 dark:text-zinc-500">
              Kurucu: {hostName}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span className="text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
            {lobby.players.length}/{lobby.maxPlayers}
          </span>
          {renderAction()}
        </div>
      </div>

      {/* Password entry for private lobbies, revealed on first "Katıl" */}
      {showPassword && !isMine && !isFull && !inAnotherLobby && (
        <div className="mt-3 flex gap-2">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={32}
            placeholder="Lobi şifresi"
            autoFocus
          />
          <button
            type="button"
            onClick={() => void doJoin()}
            disabled={joining}
            className="shrink-0 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            Gir
          </button>
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
