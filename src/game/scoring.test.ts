import { describe, expect, it } from 'vitest';
import {
  finishBonusOf,
  finishFlagsOf,
  FINISH_BONUS,
  HAND_FINISH_BONUS,
  handValueOf,
  lowestScorer,
  matchLeader,
  NOT_OPENED_PENALTY,
  opponentMultiplierOf,
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

describe('finish kinds', () => {
  const order = ['a', 'b', 'c', 'd'];
  const flags = (over: Partial<Parameters<typeof finishFlagsOf>[0]> = {}) =>
    finishFlagsOf({
      uid: 'a',
      playerOrder: order,
      opened: { a: true },
      openedWith: { a: 'meld' },
      okeyDiscard: false,
      ...over,
    });

  it('is an ordinary finish when the player opened on an earlier turn', () => {
    // No `openedThisTurn` marker -> the open happened before this turn.
    const f = flags();
    expect(f).toEqual({
      hand: false,
      headShot: false,
      pairs: false,
      okey: false,
    });
    expect(finishBonusOf(f)).toBe(FINISH_BONUS);
    expect(opponentMultiplierOf(f)).toBe(1);
  });

  it('is elden bitme when the marker names the finisher', () => {
    // b has opened too, so it is not a kafa atma.
    const f = flags({ openedThisTurn: 'a', opened: { a: true, b: true } });
    expect(f.hand).toBe(true);
    expect(f.headShot).toBe(false);
    expect(finishBonusOf(f)).toBe(HAND_FINISH_BONUS);
    expect(opponentMultiplierOf(f)).toBe(1); // plain elden bitme does not multiply
  });

  it('is kafa atma when nobody else had opened', () => {
    const f = flags({ openedThisTurn: 'a' });
    expect(f.headShot).toBe(true);
    expect(opponentMultiplierOf(f)).toBe(2);
  });

  it('still counts as kafa atma when only the partner has opened', () => {
    const f = flags({
      openedThisTurn: 'a',
      teams: { a: 0, b: 1, c: 0, d: 1 },
      opened: { a: true, c: true }, // c is a's partner
    });
    expect(f.headShot).toBe(true);
  });

  it('is not kafa atma once an opponent has opened', () => {
    const f = flags({
      openedThisTurn: 'a',
      teams: { a: 0, b: 1, c: 0, d: 1 },
      opened: { a: true, b: true },
    });
    expect(f.hand).toBe(true);
    expect(f.headShot).toBe(false);
  });

  it('ignores a marker left by another player', () => {
    const f = flags({ openedThisTurn: 'b' });
    expect(f.hand).toBe(false);
    expect(f.headShot).toBe(false);
  });

  it('stacks kafa atma with an okey discard', () => {
    const f = flags({ openedThisTurn: 'a', okeyDiscard: true });
    expect(opponentMultiplierOf(f)).toBe(4);
  });

  it('treats a pairs opening as çift bitme and pays -200', () => {
    const f = flags({ openedWith: { a: 'pair' } });
    expect(f.pairs).toBe(true);
    expect(finishBonusOf(f)).toBe(HAND_FINISH_BONUS);
    expect(opponentMultiplierOf(f)).toBe(2);
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
      finishBonus: FINISH_BONUS,
      opponentMultiplier: 1,
    });
    expect(result).toEqual({
      a: FINISH_BONUS, // -101
      b: 14, // opened, holds 14
      c: NOT_OPENED_PENALTY, // 202, never opened
      d: 5,
    });
  });

  it('multiplies the opponents but never the finisher', () => {
    const result = scoreRound({
      playerOrder: order,
      opened: { a: true, b: true, c: false, d: true },
      openedWith: { a: 'meld', b: 'meld', d: 'meld' },
      handValue: { a: 0, b: 14, c: 0, d: 5 },
      winner: 'a', // ordinary finish, but closed on the okey
      finishBonus: FINISH_BONUS,
      opponentMultiplier: 2,
    });
    expect(result).toEqual({ a: -101, b: 28, c: 404, d: 10 });
  });

  it('doubles only the pair opener (their own commitment)', () => {
    const result = scoreRound({
      playerOrder: order,
      opened: { a: true, b: true, c: false, d: true },
      openedWith: { a: 'meld', b: 'pair', d: 'meld' },
      handValue: { a: 0, b: 14, c: 0, d: 5 },
      winner: 'a',
      finishBonus: FINISH_BONUS,
      opponentMultiplier: 1,
    });
    // b opened with pairs -> their held value doubles; others unchanged.
    expect(result).toEqual({ a: -101, b: 28, c: 202, d: 5 });
  });

  it('stacks the pair opener commitment with the round multiplier', () => {
    const result = scoreRound({
      playerOrder: order,
      opened: { a: true, b: true, c: false, d: true },
      openedWith: { a: 'meld', b: 'pair', d: 'meld' },
      handValue: { a: 0, b: 14, c: 0, d: 5 },
      winner: 'a',
      finishBonus: FINISH_BONUS,
      opponentMultiplier: 2,
    });
    // b pays ×2 for their own pairs commitment AND ×2 for the round -> ×4.
    expect(result).toEqual({ a: -101, b: 56, c: 404, d: 10 });
  });

  it('pays a pairs finisher a flat -200 while opponents double', () => {
    const result = scoreRound({
      playerOrder: order,
      opened: { a: true, b: true, c: false, d: true },
      openedWith: { a: 'pair', b: 'meld', d: 'meld' },
      handValue: { a: 0, b: 14, c: 0, d: 5 },
      winner: 'a', // çift bitme
      finishBonus: HAND_FINISH_BONUS,
      opponentMultiplier: 2,
    });
    // a is a pair opener too, but the finisher's bonus is never multiplied.
    expect(result).toEqual({ a: -200, b: 28, c: 404, d: 10 });
  });

  it('elden bitme pays -200 with no multiplier on the opponents', () => {
    const result = scoreRound({
      playerOrder: order,
      opened: { a: true, b: true, c: false, d: true },
      openedWith: { a: 'meld', b: 'meld', d: 'meld' },
      handValue: { a: 0, b: 14, c: 0, d: 5 },
      winner: 'a',
      finishBonus: HAND_FINISH_BONUS,
      opponentMultiplier: 1,
    });
    expect(result).toEqual({ a: -200, b: 14, c: 202, d: 5 });
  });

  it('kafa atma on the okey quadruples every opponent', () => {
    const result = scoreRound({
      playerOrder: order,
      opened: { a: true, b: false, c: false, d: false },
      openedWith: { a: 'meld' },
      handValue: { a: 0, b: 14, c: 0, d: 5 },
      winner: 'a',
      finishBonus: HAND_FINISH_BONUS,
      opponentMultiplier: 4, // kafa atma ×2, okey ×2
    });
    expect(result).toEqual({ a: -200, b: 808, c: 808, d: 808 });
  });

  it("zeroes the finisher's partner in eşli mode", () => {
    const result = scoreRound({
      playerOrder: order,
      // c is a's partner: never opened and holding 30, but it stops mattering.
      teams: { a: 0, b: 1, c: 0, d: 1 },
      opened: { a: true, b: true, c: false, d: true },
      handValue: { a: 0, b: 14, c: 30, d: 5 },
      openedWith: { a: 'meld', b: 'meld', d: 'meld' },
      winner: 'a',
      finishBonus: FINISH_BONUS,
      opponentMultiplier: 1,
    });
    expect(result).toEqual({ a: -101, b: 14, c: 0, d: 5 });
  });

  it('does not multiply the partner either', () => {
    const result = scoreRound({
      playerOrder: order,
      teams: { a: 0, b: 1, c: 0, d: 1 },
      opened: { a: true, b: false, c: false, d: false },
      handValue: { a: 0, b: 14, c: 30, d: 5 },
      openedWith: { a: 'meld' },
      winner: 'a', // kafa atma + okey
      finishBonus: HAND_FINISH_BONUS,
      opponentMultiplier: 4,
    });
    // Team 0: -200 + 0. Team 1: two non-openers at 202 × 4.
    expect(result).toEqual({ a: -200, b: 808, c: 0, d: 808 });
  });

  it('leaves solo mode untouched (no teams -> no partner rule)', () => {
    const result = scoreRound({
      playerOrder: order,
      opened: { a: true, b: true, c: false, d: true },
      handValue: { a: 0, b: 14, c: 30, d: 5 },
      openedWith: { a: 'meld', b: 'meld', d: 'meld' },
      winner: 'a',
      finishBonus: FINISH_BONUS,
      opponentMultiplier: 1,
    });
    expect(result).toEqual({ a: -101, b: 14, c: 202, d: 5 });
  });

  it('applies no partner rule when the deck ran out (no winner)', () => {
    const result = scoreRound({
      playerOrder: order,
      teams: { a: 0, b: 1, c: 0, d: 1 },
      opened: { a: true, b: true, c: false, d: true },
      handValue: { a: 9, b: 14, c: 30, d: 5 },
      openedWith: { a: 'meld', b: 'meld', d: 'meld' },
      finishBonus: FINISH_BONUS,
      opponentMultiplier: 1,
    });
    expect(result).toEqual({ a: 9, b: 14, c: 202, d: 5 });
  });

  it('non-openers always score a flat 202 (a team of two sums to 404)', () => {
    // Both members of team 0 (a&c) fail to open: each is 202, NOT doubled —
    // their combined team total is 404 naturally. No per-player 404.
    const result = scoreRound({
      playerOrder: order,
      opened: { a: false, b: true, c: false, d: true },
      openedWith: { b: 'meld', d: 'meld' },
      handValue: { a: 0, b: 6, c: 0, d: 7 },
      finishBonus: FINISH_BONUS,
      opponentMultiplier: 1,
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
      finishBonus: FINISH_BONUS,
      opponentMultiplier: 1,
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
