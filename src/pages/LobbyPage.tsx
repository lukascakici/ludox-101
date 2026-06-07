import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getLobby } from '@/services/firebase/lobbyService';
import { bestOfLabels, gameModeLabels } from '@/constants/lobby';
import { type Lobby } from '@/types/lobby';

type LoadState = 'loading' | 'ready' | 'notfound' | 'error';

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-100 py-2 last:border-0 dark:border-felt-800">
      <span className="text-sm text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
        {value}
      </span>
    </div>
  );
}

/** Lobby room (placeholder). Loads the lobby and shows its settings summary. */
export function LobbyPage() {
  const { id } = useParams<{ id: string }>();
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    if (!id) return;
    let active = true;
    setState('loading');
    getLobby(id)
      .then((result) => {
        if (!active) return;
        if (result) {
          setLobby(result);
          setState('ready');
        } else {
          setState('notfound');
        }
      })
      .catch((err) => {
        if (!active) return;
        console.error('getLobby failed:', err);
        setState('error');
      });
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <div className="space-y-4">
      <Link
        to="/"
        className="inline-block text-sm text-zinc-500 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        ← Lobilere dön
      </Link>

      {state === 'loading' && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Yükleniyor…</p>
      )}

      {state === 'notfound' && (
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Lobi bulunamadı.
        </p>
      )}

      {state === 'error' && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          Lobi yüklenirken bir hata oluştu.
        </p>
      )}

      {state === 'ready' && lobby && <LobbyDetails lobby={lobby} />}
    </div>
  );
}

function LobbyDetails({ lobby }: { lobby: Lobby }) {
  const { settings } = lobby;
  const rules = settings.gameRules;

  const matchSummary =
    settings.matchFormat.bestOf > 1
      ? `${bestOfLabels[settings.matchFormat.bestOf] ?? `Best of ${settings.matchFormat.bestOf}`} · set başına ${settings.matchFormat.roundsPerSet} tur`
      : `Düz · ${settings.matchFormat.roundsPerSet} tur`;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-felt-800 dark:bg-felt-900">
      <h1 className="text-2xl font-bold tracking-tight">{lobby.name}</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        {lobby.players.length}/{lobby.maxPlayers} oyuncu
      </p>

      <div className="mt-5">
        <SummaryRow label="Mod" value={gameModeLabels[settings.gameMode]} />
        <SummaryRow label="Maç" value={matchSummary} />
        <SummaryRow label="Hamle Süresi" value={`${settings.turnDuration} sn`} />
        <SummaryRow
          label="Ceza Sistemi"
          value={rules.floorPenalty ? 'Cezalı' : 'Cezasız'}
        />
        <SummaryRow
          label="Rekor Cezası"
          value={rules.rekorPenalty ? 'Rekorlu' : 'Rekorsuz'}
        />
        <SummaryRow
          label="Katlama"
          value={rules.doubling ? 'Katlamalı' : 'Katlamasız'}
        />
        <SummaryRow
          label="Gizlilik"
          value={settings.isPrivate ? 'Şifreli' : 'Herkese Açık'}
        />
      </div>
    </div>
  );
}
