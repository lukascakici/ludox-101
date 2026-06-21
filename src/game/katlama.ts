import type { GameState } from '@/types/game';
import { OPENING_MIN, PAIRS_MIN } from './melds';

/**
 * Katlama (rising opening bar). When enabled, each player's FIRST open must
 * STRICTLY exceed the highest same-type opening made by their OPPONENTS so far:
 * meld total for melds, pair count for pairs. Solo mode treats every other
 * player as an opponent; paired mode counts only the opposing team (a partner's
 * opening does NOT raise your bar). The pure helpers here are shared by the game
 * service (enforcement) and the UI (showing the effective target).
 */

/** The minimal slice of game state the katlama bar depends on. */
export type KatlamaState = Pick<
  GameState,
  'doubling' | 'teams' | 'playerOrder' | 'opened' | 'openedWith' | 'openValue'
>;

/**
 * Highest FIRST-open value of `kind` made by `uid`'s opponents so far (same-team
 * and own openings excluded). Returns 0 if no opponent has opened that way yet.
 */
export function opponentOpenMax(
  game: KatlamaState,
  uid: string,
  kind: 'meld' | 'pair',
): number {
  const myTeam = game.teams?.[uid];
  let max = 0;
  for (const player of game.playerOrder) {
    if (player === uid) continue;
    if (game.teams && game.teams[player] === myTeam) continue;
    if ((game.opened ?? {})[player] !== true) continue;
    if ((game.openedWith ?? {})[player] !== kind) continue;
    const value = (game.openValue ?? {})[player] ?? 0;
    if (value > max) max = value;
  }
  return max;
}

/**
 * Effective FIRST-open minimum for a meld open (point total). Normally
 * `OPENING_MIN` (101); under katlama it rises to one past the highest opposing
 * meld opening.
 */
export function effectiveOpenMin(game: KatlamaState, uid: string): number {
  if (game.doubling !== true) return OPENING_MIN;
  return Math.max(OPENING_MIN, opponentOpenMax(game, uid, 'meld') + 1);
}

/**
 * Effective FIRST-open minimum for a pairs open (pair count). Normally
 * `PAIRS_MIN` (5); under katlama it rises to one past the highest opposing pairs
 * opening.
 */
export function effectivePairMin(game: KatlamaState, uid: string): number {
  if (game.doubling !== true) return PAIRS_MIN;
  return Math.max(PAIRS_MIN, opponentOpenMax(game, uid, 'pair') + 1);
}
