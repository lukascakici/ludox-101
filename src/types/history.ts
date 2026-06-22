import type { Timestamp } from 'firebase/firestore';
import type { GameMode } from './lobby';

/** A player as captured in a finished-match history record. */
export interface MatchHistoryPlayer {
  uid: string;
  displayName: string;
  /** Team in paired mode (absent in solo). */
  team?: 0 | 1;
}

/**
 * A summary of one finished match, stored per registered player at
 * `users/{uid}/history/{matchId}`. Anonymous users get no history.
 */
export interface MatchHistoryEntry {
  /** Firestore doc id (set when read, not stored in the doc body). */
  id: string;
  /** When the match ended. */
  playedAt: Timestamp;
  gameMode: GameMode;
  roundsPerSet: number;
  bestOf: number;
  players: MatchHistoryPlayer[];
  /** Winning side: a player uid (solo) or a team key '0' | '1' (paired). */
  winner: string;
  /** Whether the owner of this record (or their team) won the match. */
  won: boolean;
  /** Sets won per side; for a flat `bestOf: 1` match it's `{ winner: 1 }`. */
  setsWon: Record<string, number>;
}
