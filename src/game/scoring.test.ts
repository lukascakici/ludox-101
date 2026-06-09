import { describe, expect, it } from 'vitest';
import {
  FINISH_BONUS,
  handValueOf,
  lowestScorer,
  NOT_OPENED_PENALTY,
  scoreRound,
  tileValue,
} from './scoring';
import { computeOkey } from './okey';
import type { Tile, TileColor } from './tiles';

const okey = computeOkey({ kind: 'number', color: 'red', value: 7 }); // okey = red 8

let seq = 0;
const T = (color: TileColor, value: number): Tile => ({
  id: `t-${seq++}`,
  face: { kind: 'number', color, value },
});
const FJ = (): Tile => ({ id: `fj-${seq++}`, face: { kind: 'false-joker' } });

describe('tileValue / handValueOf', () => {
  it('counts a numbered tile as its face value', () => {
    expect(tileValue(T('red', 9).face, okey)).toBe(9);
  });

  it('counts a false joker as the okey number (red 8 -> 8)', () => {
    expect(tileValue(FJ().face, okey)).toBe(8);
  });

  it('sums a hand', () => {
    expect(handValueOf([T('red', 9), T('blue', 3), FJ()], okey)).toBe(20);
  });
});

describe('scoreRound', () => {
  const order = ['a', 'b', 'c', 'd'];

  it('scores finisher, not-opened, and held-tile players', () => {
    const result = scoreRound({
      playerOrder: order,
      opened: { a: true, b: true, c: false, d: true },
      openedWith: { a: 'meld', b: 'meld', d: 'meld' },
      handValue: { a: 0, b: 14, c: 30, d: 5 },
      winner: 'a',
      globalDouble: false,
    });
    expect(result).toEqual({
      a: FINISH_BONUS, // -101
      b: 14, // opened, holds 14
      c: NOT_OPENED_PENALTY, // 202, never opened
      d: 5,
    });
  });

  it('doubles every player on a special finish', () => {
    const result = scoreRound({
      playerOrder: order,
      opened: { a: true, b: true, c: false, d: true },
      openedWith: { a: 'meld', b: 'meld', d: 'meld' },
      handValue: { a: 0, b: 14, c: 0, d: 5 },
      winner: 'a',
      globalDouble: true,
    });
    expect(result).toEqual({ a: -202, b: 28, c: 404, d: 10 });
  });

  it('doubles only the pair opener (their own commitment)', () => {
    const result = scoreRound({
      playerOrder: order,
      opened: { a: true, b: true, c: false, d: true },
      openedWith: { a: 'meld', b: 'pair', d: 'meld' },
      handValue: { a: 0, b: 14, c: 0, d: 5 },
      winner: 'a',
      globalDouble: false,
    });
    // b opened with pairs -> their held value doubles; others unchanged.
    expect(result).toEqual({ a: -101, b: 28, c: 202, d: 5 });
  });

  it('does not stack pair-opener doubling beyond ×2 on a special finish', () => {
    const result = scoreRound({
      playerOrder: order,
      opened: { a: true, b: true, c: false, d: true },
      openedWith: { a: 'pair', b: 'meld', d: 'meld' },
      handValue: { a: 0, b: 14, c: 0, d: 5 },
      winner: 'a', // a finished a pairs hand -> globalDouble
      globalDouble: true,
    });
    // a is both the finisher AND a pair opener, but doubling caps at ×2.
    expect(result).toEqual({ a: -202, b: 28, c: 404, d: 10 });
  });

  it('deck-exhausted: a pair opener still doubles their held tiles', () => {
    const result = scoreRound({
      playerOrder: order,
      opened: { a: true, b: false, c: true, d: false },
      openedWith: { a: 'pair', c: 'meld' },
      handValue: { a: 12, b: 99, c: 8, d: 99 },
      globalDouble: false,
    });
    expect(result).toEqual({ a: 24, b: 202, c: 8, d: 202 });
  });
});

describe('lowestScorer', () => {
  it('returns the uid with the lowest total', () => {
    expect(lowestScorer(['a', 'b', 'c'], { a: 50, b: -10, c: 30 })).toBe('b');
  });
});
