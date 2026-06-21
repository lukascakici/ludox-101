import {
  MAX_VALUE,
  MIN_VALUE,
  type Tile,
  type TileColor,
  type TileFace,
} from './tiles';

/** The tile value/color that is the okey this round (one above the indicator). */
export interface OkeyMatch {
  color: TileColor;
  value: number;
}

/**
 * Computes the okey from the indicator (gösterge): same color, one value higher
 * (13 wraps to 1). A false-joker indicator has no okey.
 */
export function computeOkey(indicator: TileFace): OkeyMatch | null {
  if (indicator.kind !== 'number') return null;
  const value = indicator.value === MAX_VALUE ? MIN_VALUE : indicator.value + 1;
  return { color: indicator.color, value };
}

/** Whether a tile is the okey for this round. */
export function isOkeyTile(tile: TileFace, okey: OkeyMatch | null): boolean {
  return (
    !!okey &&
    tile.kind === 'number' &&
    tile.color === okey.color &&
    tile.value === okey.value
  );
}

/** How many okey tiles a hand holds (there are two okeys in the deck). */
export function countOkeys(tiles: Tile[], okey: OkeyMatch | null): number {
  return tiles.reduce((n, t) => n + (isOkeyTile(t.face, okey) ? 1 : 0), 0);
}
