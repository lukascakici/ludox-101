import { describe, expect, it } from 'vitest';
import {
  emptierTeam,
  seatOrderForGame,
  teamsBalanced,
} from '@/constants/lobby';
import { GameMode, type LobbyPlayer } from '@/types/lobby';

function player(uid: string, team?: 0 | 1): LobbyPlayer {
  return { uid, displayName: uid, isHost: false, ...(team != null ? { team } : {}) };
}

describe('team helpers', () => {
  it('seats partners across the table (team0, team1, team0, team1)', () => {
    // Join order is interleaved; teams are 0,0,1,1 to prove ordering is by team.
    const players = [
      player('a', 0),
      player('b', 0),
      player('c', 1),
      player('d', 1),
    ];
    const order = seatOrderForGame(players, GameMode.Paired).map((p) => p.uid);
    expect(order).toEqual(['a', 'c', 'b', 'd']);
    // Seats 0 & 2 are team 0; seats 1 & 3 are team 1 (partners across).
    expect([order[0], order[2]]).toEqual(['a', 'b']);
    expect([order[1], order[3]]).toEqual(['c', 'd']);
  });

  it('keeps join order in solo mode', () => {
    const players = [player('a'), player('b'), player('c'), player('d')];
    const order = seatOrderForGame(players, GameMode.Solo).map((p) => p.uid);
    expect(order).toEqual(['a', 'b', 'c', 'd']);
  });

  it('teamsBalanced requires exactly 2 vs 2', () => {
    expect(
      teamsBalanced([player('a', 0), player('b', 0), player('c', 1), player('d', 1)]),
    ).toBe(true);
    expect(
      teamsBalanced([player('a', 0), player('b', 0), player('c', 0), player('d', 1)]),
    ).toBe(false);
    expect(teamsBalanced([player('a', 0), player('b', 1)])).toBe(false);
  });

  it('emptierTeam picks the team with room (ties → 0)', () => {
    expect(emptierTeam([])).toBe(0);
    expect(emptierTeam([player('a', 0)])).toBe(1);
    expect(emptierTeam([player('a', 1)])).toBe(0);
    expect(emptierTeam([player('a', 0), player('b', 1)])).toBe(0);
  });
});
