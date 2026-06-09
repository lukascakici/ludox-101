import type { OkeyMatch } from './okey';
import type { Tile, TileFace } from './tiles';

/**
 * Okey 101 round scoring (penalty-based — LOWER total wins the match).
 *
 * At the end of a round each player is scored:
 *  - the finisher (el kapatan): a fixed bonus of -101,
 *  - a player who never opened: a fixed penalty of 202,
 *  - a player who opened but still holds tiles: the sum of their held values.
 * A "special" finish (closing by discarding the okey, or finishing a pairs
 * hand) doubles every player's result for that round.
 *
 * (Eşli/paired nuance — both partners failing to open scores 404 — is deferred
 * until paired mode exists.)
 */

export const NOT_OPENED_PENALTY = 202;
export const FINISH_BONUS = -101;

/** Penalty value a single held tile contributes at round end. */
export function tileValue(face: TileFace, okey: OkeyMatch | null): number {
  // A false joker stands for the okey's number; the okey tile is itself a
  // numbered tile, so numbered tiles just count their face value.
  if (face.kind === 'false-joker') return okey ? okey.value : 0;
  return face.value;
}

/** Total held-tile value of a hand. */
export function handValueOf(tiles: Tile[], okey: OkeyMatch | null): number {
  return tiles.reduce((sum, tile) => sum + tileValue(tile.face, okey), 0);
}

export interface RoundScoreContext {
  playerOrder: string[];
  opened: Record<string, boolean>;
  /** How each player opened. A PAIR opener's own score is always doubled. */
  openedWith: Record<string, 'meld' | 'pair'>;
  /** Public held-tile value per player (maintained as tiles move). */
  handValue: Record<string, number>;
  /** The finisher uid, or undefined for a deck-exhausted (no-winner) end. */
  winner?: string;
  /** A special finish (okey-discard or pairs finish) doubles EVERY player. */
  globalDouble: boolean;
}

/**
 * Computes each player's penalty points for one finished round.
 *
 * Doubling is per-player and never stacks beyond ×2: a player's score doubles if
 * the round was a special finish (globalDouble) OR they themselves opened with
 * pairs (a doubled commitment, win or lose).
 */
export function scoreRound(ctx: RoundScoreContext): Record<string, number> {
  const result: Record<string, number> = {};
  for (const uid of ctx.playerOrder) {
    let base: number;
    if (uid === ctx.winner) base = FINISH_BONUS;
    else if (!ctx.opened[uid]) base = NOT_OPENED_PENALTY;
    else base = ctx.handValue[uid] ?? 0;
    const doubled = ctx.globalDouble || ctx.openedWith[uid] === 'pair';
    result[uid] = doubled ? base * 2 : base;
  }
  return result;
}

/** The uid with the lowest total (the leader / would-be winner). Ties → first. */
export function lowestScorer(
  playerOrder: string[],
  totals: Record<string, number>,
): string | undefined {
  let best: string | undefined;
  let bestValue = Infinity;
  for (const uid of playerOrder) {
    const value = totals[uid] ?? 0;
    if (value < bestValue) {
      bestValue = value;
      best = uid;
    }
  }
  return best;
}
