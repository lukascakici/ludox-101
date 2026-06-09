import { describe, expect, it } from 'vitest';
import { arrangeBestMelds, arrangePairs, scoreArrangement } from './arrange';
import { computeOkey } from './okey';
import type { Tile, TileColor } from './tiles';

const okey = computeOkey({ kind: 'number', color: 'red', value: 7 }); // okey = red 8

let seq = 0;
const T = (color: TileColor, value: number): Tile => ({
  id: `t-${seq++}`,
  face: { kind: 'number', color, value },
});
const OKEY = (): Tile => T('red', 8);

describe('scoreArrangement', () => {
  it('sums meld values and counts pairs separately', () => {
    const groups = [
      [T('red', 5), T('red', 6), T('red', 7)], // run = 18
      [T('blue', 9), T('blue', 9)], // pair
    ];
    expect(scoreArrangement(groups, okey)).toEqual({ series: 18, pairs: 1 });
  });

  it('ignores invalid groups', () => {
    const groups = [[T('red', 5), T('blue', 6)]]; // neither meld nor pair
    expect(scoreArrangement(groups, okey)).toEqual({ series: 0, pairs: 0 });
  });
});

describe('arrangePairs', () => {
  it('pulls out pairs and leaves the rest loose', () => {
    const hand = [
      T('red', 5),
      T('red', 5),
      T('blue', 8),
      T('blue', 8),
      T('black', 1),
    ];
    const { groups, loose } = arrangePairs(hand, okey);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.length === 2)).toBe(true);
    expect(loose).toHaveLength(1);
    expect(loose[0].face).toEqual({ kind: 'number', color: 'black', value: 1 });
  });
});

describe('arrangeBestMelds', () => {
  it('finds a simple run and leaves nothing loose', () => {
    const hand = [T('red', 1), T('red', 2), T('red', 3)];
    const { groups, loose } = arrangeBestMelds(hand, okey);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
    expect(loose).toHaveLength(0);
  });

  it('uses the okey wildcard to maximise a run value', () => {
    // 5,6 + okey -> fills 7 (highest) for a 5-6-7 run = 18.
    const hand = [T('red', 5), T('red', 6), OKEY()];
    const { groups } = arrangeBestMelds(hand, okey);
    expect(scoreArrangement(groups, okey).series).toBe(18);
  });

  it('maximises total value across competing melds', () => {
    // A run 5-6-7 (=18) plus a group of three 9s (=27) — both should be taken.
    const hand = [
      T('red', 5),
      T('red', 6),
      T('red', 7),
      T('red', 9),
      T('blue', 9),
      T('black', 9),
    ];
    const { groups, loose } = arrangeBestMelds(hand, okey);
    expect(scoreArrangement(groups, okey).series).toBe(45);
    expect(loose).toHaveLength(0);
  });
});
