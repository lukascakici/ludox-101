import { describe, expect, it } from 'vitest';
import {
  effectiveOpenMin,
  effectivePairMin,
  opponentOpenMax,
  type KatlamaState,
} from './katlama';

/** Builds a minimal katlama state; openings are passed as uid → first-open info. */
function state(
  doubling: boolean,
  openings: Record<string, { kind: 'meld' | 'pair'; value: number }>,
  teams?: Record<string, 0 | 1>,
): KatlamaState {
  const opened: Record<string, boolean> = {};
  const openedWith: Record<string, 'meld' | 'pair'> = {};
  const openValue: Record<string, number> = {};
  for (const [uid, info] of Object.entries(openings)) {
    opened[uid] = true;
    openedWith[uid] = info.kind;
    openValue[uid] = info.value;
  }
  return {
    doubling,
    playerOrder: ['a', 'b', 'c', 'd'],
    opened,
    openedWith,
    openValue,
    ...(teams ? { teams } : {}),
  };
}

describe('katlama — rising opening bar', () => {
  it('off: the threshold is always the base (101 / 5 pairs)', () => {
    const g = state(false, { b: { kind: 'meld', value: 140 } });
    expect(effectiveOpenMin(g, 'a')).toBe(101);
    expect(effectivePairMin(g, 'a')).toBe(5);
  });

  it('on with no prior opening: still the base threshold', () => {
    const g = state(true, {});
    expect(effectiveOpenMin(g, 'a')).toBe(101);
    expect(effectivePairMin(g, 'a')).toBe(5);
  });

  it('on: a meld opening raises the next meld bar to one past it', () => {
    const g = state(true, { b: { kind: 'meld', value: 129 } });
    expect(effectiveOpenMin(g, 'a')).toBe(130);
    // Pairs bar is independent of meld openings.
    expect(effectivePairMin(g, 'a')).toBe(5);
  });

  it('on: a 5-pair opening raises the next pairs bar to 6', () => {
    const g = state(true, { b: { kind: 'pair', value: 5 } });
    expect(effectivePairMin(g, 'a')).toBe(6);
    expect(effectiveOpenMin(g, 'a')).toBe(101);
  });

  it('on: the bar is the HIGHEST opposing opening, not the most recent', () => {
    const g = state(true, {
      b: { kind: 'meld', value: 105 },
      c: { kind: 'meld', value: 160 },
    });
    expect(opponentOpenMax(g, 'a', 'meld')).toBe(160);
    expect(effectiveOpenMin(g, 'a')).toBe(161);
  });

  it("paired: only the OPPOSING team's openings raise your bar", () => {
    // a & c are team 0; b & d are team 1. a's partner c opened high.
    const teams: Record<string, 0 | 1> = { a: 0, b: 1, c: 0, d: 1 };
    const g = state(
      true,
      {
        c: { kind: 'meld', value: 150 }, // a's partner — must NOT bind a
        b: { kind: 'meld', value: 120 }, // opponent
      },
      teams,
    );
    // a only has to beat the opposing team's 120, not the partner's 150.
    expect(effectiveOpenMin(g, 'a')).toBe(121);
  });
});
