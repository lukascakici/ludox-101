import { describe, expect, it } from 'vitest';
import {
  FINISH_BONUS,
  handValueOf,
  lowestScorer,
  matchLeader,
  NOT_OPENED_PENALTY,
  scoreRound,
  setMajority,
  setWinnerOf,
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

  it('non-openers always score a flat 202 (a team of two sums to 404)', () => {
    // Both members of team 0 (a&c) fail to open: each is 202, NOT doubled —
    // their combined team total is 404 naturally. No per-player 404.
    const result = scoreRound({
      playerOrder: order,
      opened: { a: false, b: true, c: false, d: true },
      openedWith: { b: 'meld', d: 'meld' },
      handValue: { a: 0, b: 6, c: 0, d: 7 },
      globalDouble: false,
    });
    expect(result).toEqual({ a: 202, b: 6, c: 202, d: 7 });
    expect((result.a ?? 0) + (result.c ?? 0)).toBe(404);
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

describe('set / match progression', () => {
  it('setMajority needs a strict majority of sets', () => {
    expect(setMajority(1)).toBe(1);
    expect(setMajority(3)).toBe(2);
    expect(setMajority(5)).toBe(3);
    expect(setMajority(7)).toBe(4);
  });

  it('setWinnerOf picks the side with the lowest set total', () => {
    // Solo: each player is a side.
    expect(setWinnerOf(['a', 'b', 'c', 'd'], { a: 90, b: 12, c: 50, d: 70 })).toBe('b');
    // Paired: the two teams are the sides (totals combined per team).
    expect(setWinnerOf(['0', '1'], { '0': -40, '1': 120 })).toBe('0');
  });

  it('matchLeader picks the side with the most sets won', () => {
    expect(matchLeader(['0', '1'], { '0': 2, '1': 1 })).toBe('0');
    expect(matchLeader(['a', 'b', 'c', 'd'], { a: 0, c: 3, d: 1 })).toBe('c');
  });
});
