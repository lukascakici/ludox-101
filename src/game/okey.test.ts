import { describe, expect, it } from 'vitest';
import { computeOkey, countOkeys, isOkeyTile } from './okey';
import type { Tile, TileColor } from './tiles';

// Indicator red 7 → okey is red 8.
const okey = computeOkey({ kind: 'number', color: 'red', value: 7 });

let seq = 0;
const T = (color: TileColor, value: number): Tile => ({
  id: `t-${seq++}`,
  face: { kind: 'number', color, value },
});
const FJ = (): Tile => ({ id: `fj-${seq++}`, face: { kind: 'false-joker' } });

describe('okey identity', () => {
  it('the okey is the indicator + 1 (same colour)', () => {
    expect(isOkeyTile(T('red', 8).face, okey)).toBe(true);
    expect(isOkeyTile(T('blue', 8).face, okey)).toBe(false); // wrong colour
    expect(isOkeyTile(T('red', 7).face, okey)).toBe(false); // the indicator itself
  });

  it('a false joker is NOT the okey', () => {
    expect(isOkeyTile(FJ().face, okey)).toBe(false);
  });

  it('countOkeys counts both okey tiles, ignoring false jokers', () => {
    const hand = [T('red', 8), T('red', 8), T('blue', 3), FJ()];
    expect(countOkeys(hand, okey)).toBe(2);
    expect(countOkeys([T('blue', 3), FJ()], okey)).toBe(0);
  });
});
