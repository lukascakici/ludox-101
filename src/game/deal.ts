import { buildTileSet, shuffle, type Tile } from './tiles';

export const PLAYER_COUNT = 4;
/** Okey 101 deals 21 tiles per player; the starting player gets one extra (22). */
export const HAND_SIZE = 21;

export interface DealResult {
  /** One hand per player. The starter's hand has HAND_SIZE + 1 tiles. */
  hands: Tile[][];
  /** The face-up indicator (gösterge) — always a numbered tile. */
  indicator: Tile;
  /** Remaining face-down draw pile. */
  drawPile: Tile[];
  /** Index (0..PLAYER_COUNT-1) of the player who starts. */
  starterIndex: number;
}

/**
 * Shuffles a full set and deals a new round: 21 tiles to each player (22 to the
 * starter), a numbered indicator, and the rest as the draw pile (20 tiles).
 *
 * This is meant to run ONCE per round (e.g. by the host on game start) and have
 * its result shared via the database — not recomputed per client.
 */
export function deal(): DealResult {
  const deck = shuffle(buildTileSet());

  // The indicator must be a numbered tile; set aside any false jokers drawn.
  const setAside: Tile[] = [];
  let indicator: Tile | undefined;
  while (deck.length > 0) {
    const tile = deck.pop();
    if (tile === undefined) break;
    if (tile.face.kind === 'number') {
      indicator = tile;
      break;
    }
    setAside.push(tile);
  }
  if (!indicator) {
    throw new Error('Deck had no numbered tile for the indicator');
  }
  // Return the set-aside false jokers to the (still shuffled) pile.
  deck.unshift(...setAside);

  const starterIndex = Math.floor(Math.random() * PLAYER_COUNT);
  const hands: Tile[][] = Array.from({ length: PLAYER_COUNT }, () => []);

  for (let round = 0; round < HAND_SIZE; round++) {
    for (let player = 0; player < PLAYER_COUNT; player++) {
      const tile = deck.pop();
      if (tile) hands[player].push(tile);
    }
  }
  // The starter receives one extra tile.
  const extra = deck.pop();
  if (extra) hands[starterIndex].push(extra);

  return { hands, indicator, drawPile: deck, starterIndex };
}
