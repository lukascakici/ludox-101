import type { GameTile } from './Tile';

/**
 * Static placeholder data for the table shell (no game logic yet).
 * Replaced by real dealt tiles once the game engine exists.
 */
export const SAMPLE_HAND: GameTile[] = [
  { kind: 'number', color: 'red', value: 4 },
  { kind: 'number', color: 'red', value: 5 },
  { kind: 'number', color: 'red', value: 6 },
  { kind: 'number', color: 'black', value: 9 },
  { kind: 'number', color: 'blue', value: 9 },
  { kind: 'number', color: 'yellow', value: 9 },
  { kind: 'number', color: 'blue', value: 11 },
  { kind: 'number', color: 'blue', value: 12 },
  { kind: 'number', color: 'blue', value: 13 },
  { kind: 'number', color: 'yellow', value: 2 },
  { kind: 'number', color: 'yellow', value: 3 },
  { kind: 'number', color: 'black', value: 7 },
  { kind: 'false-joker' },
  { kind: 'number', color: 'red', value: 10 },
  // The okey for this round (indicator red 7 -> okey red 8); shown as a blank
  // white tile by the rack.
  { kind: 'number', color: 'red', value: 8 },
];

export const SAMPLE_INDICATOR: GameTile = {
  kind: 'number',
  color: 'red',
  value: 7,
};
