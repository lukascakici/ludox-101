/**
 * Okey tile domain model and deck construction.
 *
 * A full Okey set has 106 tiles: numbers 1–13 in 4 colors, two copies each
 * (13 × 4 × 2 = 104), plus 2 false jokers (sahte okey).
 */

export type TileColor = 'red' | 'black' | 'blue' | 'yellow';

/** The visible face of a tile: a numbered color tile, or a false joker. */
export type TileFace =
  | { kind: 'number'; color: TileColor; value: number }
  | { kind: 'false-joker' };

/** A physical tile: a unique id plus its face (two tiles can share a face). */
export interface Tile {
  id: string;
  face: TileFace;
}

export const TILE_COLORS: readonly TileColor[] = [
  'red',
  'black',
  'blue',
  'yellow',
];
export const MIN_VALUE = 1;
export const MAX_VALUE = 13;
export const COPIES_PER_TILE = 2;
export const FALSE_JOKER_COUNT = 2;
export const TOTAL_TILES = 106;

/** Builds a fresh, ordered 106-tile Okey set. */
export function buildTileSet(): Tile[] {
  const tiles: Tile[] = [];

  for (const color of TILE_COLORS) {
    for (let value = MIN_VALUE; value <= MAX_VALUE; value++) {
      for (let copy = 0; copy < COPIES_PER_TILE; copy++) {
        tiles.push({
          id: `${color}-${value}-${copy}`,
          face: { kind: 'number', color, value },
        });
      }
    }
  }

  for (let i = 0; i < FALSE_JOKER_COUNT; i++) {
    tiles.push({ id: `false-joker-${i}`, face: { kind: 'false-joker' } });
  }

  return tiles;
}

/** Returns a new array shuffled with Fisher–Yates (does not mutate the input). */
export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
