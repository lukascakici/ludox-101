import type { GameTile, TileColor } from './Tile';

/** The tile value/color that is the okey this round (one above the indicator). */
export interface OkeyMatch {
  color: TileColor;
  value: number;
}

/**
 * Computes the okey from the indicator (gösterge): same color, one value higher
 * (13 wraps to 1). A false-joker indicator has no okey.
 */
export function computeOkey(indicator: GameTile): OkeyMatch | null {
  if (indicator.kind !== 'number') return null;
  const value = indicator.value === 13 ? 1 : indicator.value + 1;
  return { color: indicator.color, value };
}

/** Whether a tile is the okey for this round. */
export function isOkeyTile(tile: GameTile, okey: OkeyMatch | null): boolean {
  return (
    !!okey &&
    tile.kind === 'number' &&
    tile.color === okey.color &&
    tile.value === okey.value
  );
}
