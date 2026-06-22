import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { fetchMatchHistory } from '@/services/firebase/historyService';
import {
  formatMatchSummary,
  gameModeLabels,
  teamLabels,
} from '@/constants/lobby';
import { GameMode } from '@/types/lobby';
import type { MatchHistoryEntry } from '@/types/history';

function formatPlayedAt(entry: MatchHistoryEntry): string {
  const date = entry.playedAt?.toDate?.();
  if (!date) return '';
  return date.toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** The name of the winning side: a team in paired mode, a player in solo. */
function winnerName(entry: MatchHistoryEntry): string {
  if (entry.gameMode === GameMode.Paired) {
    return entry.winner === '0' || entry.winner === '1'
      ? teamLabels[Number(entry.winner) as 0 | 1]
      : 'Takım';
  }
  return (
    entry.players.find((p) => p.uid === entry.winner)?.displayName ?? 'Oyuncu'
  );
}

function HistoryCard({ entry }: { entry: MatchHistoryEntry }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-felt-800 dark:bg-felt-900">
      <div className="flex items-center justify-between gap-3">
        <span
          className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
            entry.won
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
              : 'bg-zinc-100 text-zinc-500 dark:bg-felt-800 dark:text-zinc-400'
          }`}
        >
          {entry.won ? 'Kazandın' : 'Kaybettin'}
        </span>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          {formatPlayedAt(entry)}
        </span>
      </div>

      <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-200">
        {gameModeLabels[entry.gameMode]} ·{' '}
        {formatMatchSummary({
          roundsPerSet: entry.roundsPerSet,
          bestOf: entry.bestOf,
        })}
      </p>

      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Kazanan: <span className="font-medium">{winnerName(entry)}</span>
        {' · '}
        {entry.players.map((p) => p.displayName).join(', ')}
      </p>
    </div>
  );
}

/** Match history for the signed-in registered player. Anonymous users see a prompt. */
export function HistoryPage() {
  const user = useAuthStore((s) => s.user);
  const [entries, setEntries] = useState<MatchHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isRegistered = !!user && !user.isAnonymous;

  useEffect(() => {
    if (!isRegistered || !user) return;
    let active = true;
    fetchMatchHistory(user.uid)
      .then((result) => {
        if (active) setEntries(result);
      })
      .catch((err) => {
        console.error('fetchMatchHistory failed:', err);
        if (active) setError('Geçmiş yüklenemedi.');
      });
    return () => {
      active = false;
    };
  }, [isRegistered, user]);

  if (!isRegistered) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Geçmiş</h1>
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-600 dark:border-felt-800 dark:bg-felt-900 dark:text-zinc-400">
          Maç geçmişi yalnızca kayıtlı kullanıcılar için tutulur. Hesap
          oluşturduğunda biten maçların burada listelenir.
        </div>
        <Link to="/" className="text-sm underline">
          Lobilere dön
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Geçmiş</h1>

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {!error && entries === null && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Yükleniyor…</p>
      )}

      {!error && entries !== null && entries.length === 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-600 dark:border-felt-800 dark:bg-felt-900 dark:text-zinc-400">
          Henüz tamamlanmış maçın yok. Bir maç bitince burada görünür.
        </div>
      )}

      {!error && entries !== null && entries.length > 0 && (
        <div className="space-y-3">
          {entries.map((entry) => (
            <HistoryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
