import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from './config';
import type { GameState } from '@/types/game';
import type { Lobby } from '@/types/lobby';
import type { MatchHistoryEntry } from '@/types/history';

/** Path to a user's match-history subcollection. */
const historyCol = (uid: string) => collection(db, 'users', uid, 'history');

/**
 * Records a finished match into the given (registered) player's own history.
 * Each player's client writes its OWN record, so it needs no broad permissions.
 * Idempotent: the doc id is derived from the match's stable `createdAt`, so a
 * reload while the match-end modal shows just overwrites the same doc.
 *
 * No-op if the match isn't actually complete, or the createdAt stamp hasn't
 * resolved yet (caller retries on the next snapshot).
 */
export async function recordMatchHistory(
  uid: string,
  lobby: Lobby,
  game: GameState,
): Promise<void> {
  if (!game.roundResult?.matchComplete) return;
  const matchId = game.createdAt?.toMillis?.();
  if (matchId == null) return;

  const winner = game.roundResult.matchWinner ?? '';
  const teams = game.teams;
  const won = teams
    ? String(teams[uid] ?? 0) === winner
    : winner === uid;

  const players = game.playerOrder.map((puid) => ({
    uid: puid,
    displayName:
      lobby.players.find((p) => p.uid === puid)?.displayName ?? 'Oyuncu',
    ...(teams ? { team: teams[puid] ?? 0 } : {}),
  }));

  const entry = {
    playedAt: serverTimestamp(),
    gameMode: lobby.settings.gameMode,
    roundsPerSet: game.roundsPerSet ?? lobby.settings.matchFormat.roundsPerSet,
    bestOf: game.bestOf ?? lobby.settings.matchFormat.bestOf,
    players,
    winner,
    won,
    setsWon: game.setsWon ?? {},
  };

  await setDoc(doc(historyCol(uid), `m-${matchId}`), entry);
}

/** Loads a player's match history, newest first. */
export async function fetchMatchHistory(
  uid: string,
): Promise<MatchHistoryEntry[]> {
  const snap = await getDocs(query(historyCol(uid), orderBy('playedAt', 'desc')));
  return snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<MatchHistoryEntry, 'id'>) }),
  );
}
