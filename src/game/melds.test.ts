import { describe, expect, it } from 'vitest';
import { classifyMeld, isPair, meldValue } from './melds';
import { computeOkey } from './okey';
import type { TileColor, TileFace } from './tiles';

// Indicator red 7 -> okey is red 8. So the red-8 tile is the wildcard, and a
// false joker melds as a concrete red 8.
const okey = computeOkey({ kind: 'number', color: 'red', value: 7 });

const N = (color: TileColor, value: number): TileFace => ({
  kind: 'number',
  color,
  value,
});
const FJ: TileFace = { kind: 'false-joker' };
const OKEY = N('red', 8); // the wildcard tile this round

describe('classifyMeld — runs', () => {
  it('accepts a same-colour consecutive run and sums its values', () => {
    const info = classifyMeld([N('red', 5), N('red', 6), N('red', 7)], okey);
    expect(info).toEqual({ kind: 'run', value: 18 });
  });

  it('rejects a run that wraps around 13->1', () => {
    expect(
      classifyMeld([N('red', 12), N('red', 13), N('red', 1)], okey),
    ).toBeNull();
  });

  it('rejects a run of mixed colours', () => {
    expect(
      classifyMeld([N('red', 5), N('blue', 6), N('red', 7)], okey),
    ).toBeNull();
  });
});

describe('classifyMeld — groups', () => {
  it('accepts a same-value group of distinct colours', () => {
    const info = classifyMeld([N('red', 5), N('blue', 5), N('black', 5)], okey);
    expect(info).toEqual({ kind: 'group', value: 15 });
  });

  it('rejects a group with a repeated colour', () => {
    expect(
      classifyMeld([N('red', 5), N('red', 5), N('blue', 5)], okey),
    ).toBeNull();
  });
});

describe('classifyMeld — joker vs false joker (the key Okey 101 rule)', () => {
  it('treats the okey tile as a true wildcard', () => {
    // 5,6,okey -> fills 7 (highest) = 5-6-7 run.
    const info = classifyMeld([N('red', 5), N('red', 6), OKEY], okey);
    expect(info).toEqual({ kind: 'run', value: 18 });
  });

  it('treats a false joker as the okey NUMBER tile (red 8), not a wildcard', () => {
    // 5,6,7,false-joker -> 5-6-7-8 (false joker = red 8) = 26.
    expect(
      meldValue([N('red', 5), N('red', 6), N('red', 7), FJ], okey),
    ).toBe(26);
  });

  it('rejects a false joker used to bridge a gap (5,6,FJ = 5,6,8)', () => {
    expect(classifyMeld([N('red', 5), N('red', 6), FJ], okey)).toBeNull();
  });
});

describe('isPair', () => {
  it('accepts two identical numbered tiles', () => {
    expect(isPair([N('red', 5), N('red', 5)], okey)).toBe(true);
  });

  it('rejects same value but different colour', () => {
    expect(isPair([N('red', 5), N('blue', 5)], okey)).toBe(false);
  });

  it('accepts any tile paired with the okey (wildcard)', () => {
    expect(isPair([N('blue', 9), OKEY], okey)).toBe(true);
  });

  it('pairs two false jokers (both resolve to red 8)', () => {
    expect(isPair([FJ, FJ], okey)).toBe(true);
  });

  it('rejects a single tile', () => {
    expect(isPair([N('red', 5)], okey)).toBe(false);
  });
});
