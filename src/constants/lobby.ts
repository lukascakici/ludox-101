import {
  GameMode,
  type Lobby,
  type LobbyPlayer,
  type LobbySettings,
  type MatchFormat,
  type TurnDuration,
} from '@/types/lobby';

/**
 * Presentation layer: maps English enum/option values to Turkish display
 * strings. Keeping labels here (instead of hardcoding Turkish in components)
 * keeps the UI language and the code decoupled.
 */

export const gameModeLabels: Record<GameMode, string> = {
  [GameMode.Paired]: 'Eşli (2v2)',
  [GameMode.Solo]: 'Tekli',
};

/* -------------------------------------------------------------------------- */
/*  Selectable option sets                                                     */
/* -------------------------------------------------------------------------- */

/** Okey 101 is played by EXACTLY 4 players (both the min and the max). */
export const OKEY101_MAX_PLAYERS = 4;

/** A lobby is full once it has its required number of players. */
export function isLobbyFull(lobby: Lobby): boolean {
  return lobby.players.length >= lobby.maxPlayers;
}

/* -------------------------------------------------------------------------- */
/*  Teams (paired mode)                                                         */
/* -------------------------------------------------------------------------- */

/** The two teams in paired mode. */
export const TEAMS: readonly (0 | 1)[] = [0, 1];

/** Players required per team in paired mode (2 vs 2). */
export const PAIRED_TEAM_SIZE = 2;

/** Turkish labels for the two teams. */
export const teamLabels: Record<0 | 1, string> = {
  0: 'Takım 1',
  1: 'Takım 2',
};

/** A player's team (defaults to team 0 if unset, e.g. legacy/solo docs). */
export function teamOf(player: LobbyPlayer): 0 | 1 {
  return player.team ?? 0;
}

/** The players currently assigned to a given team. */
export function playersInTeam(
  players: readonly LobbyPlayer[],
  team: 0 | 1,
): LobbyPlayer[] {
  return players.filter((player) => teamOf(player) === team);
}

/**
 * In paired mode the teams must be exactly 2 vs 2 before the game can start.
 * (Solo mode has no team constraint.)
 */
export function teamsBalanced(players: readonly LobbyPlayer[]): boolean {
  return TEAMS.every(
    (team) => playersInTeam(players, team).length === PAIRED_TEAM_SIZE,
  );
}

/** The team with fewer members (ties → team 0). Used to seat a new joiner. */
export function emptierTeam(players: readonly LobbyPlayer[]): 0 | 1 {
  return playersInTeam(players, 0).length <= playersInTeam(players, 1).length
    ? 0
    : 1;
}

/**
 * Seat order for a paired game: partners sit ACROSS the table, so we interleave
 * the two teams into seats (team0, team1, team0, team1) → seats 0&2 are team 0,
 * seats 1&3 are team 1. In solo mode the join order is kept as-is.
 */
export function seatOrderForGame(
  players: readonly LobbyPlayer[],
  gameMode: GameMode,
): LobbyPlayer[] {
  if (gameMode !== GameMode.Paired) return [...players];
  const t0 = playersInTeam(players, 0);
  const t1 = playersInTeam(players, 1);
  const ordered: LobbyPlayer[] = [];
  for (let i = 0; i < Math.max(t0.length, t1.length); i++) {
    if (t0[i]) ordered.push(t0[i]);
    if (t1[i]) ordered.push(t1[i]);
  }
  return ordered;
}

/** Allowed turn durations (seconds). */
export const turnDurationOptions: readonly TurnDuration[] = [15, 30, 60];

/**
 * Rounds per set is free user input. These bounds keep it sane.
 * (e.g. a flat "11 el" match or "5 el" sets are both valid.)
 */
export const MIN_ROUNDS_PER_SET = 1;
export const MAX_ROUNDS_PER_SET = 50;

/**
 * "Best of" set counts for a series match. `1` = flat single set (no series).
 * Kept odd so a majority winner always exists.
 */
export const bestOfOptions: readonly number[] = [1, 3, 5, 7];

/** Turkish labels for the bestOf options. */
export const bestOfLabels: Record<number, string> = {
  1: 'Düz (tek set)',
  3: 'Best of 3',
  5: 'Best of 5',
  7: 'Best of 7',
};

/** Human-readable Turkish summary of a match format (e.g. "Best of 3 · set başına 5 tur"). */
export function formatMatchSummary(format: MatchFormat): string {
  if (format.bestOf > 1) {
    const label = bestOfLabels[format.bestOf] ?? `Best of ${format.bestOf}`;
    return `${label} · set başına ${format.roundsPerSet} tur`;
  }
  return `Düz · ${format.roundsPerSet} tur`;
}

/* -------------------------------------------------------------------------- */
/*  Defaults                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Sensible default settings for a brand-new Okey 101 lobby.
 * Returns a fresh object each call so callers can mutate form state safely.
 */
export function createDefaultLobbySettings(): LobbySettings {
  return {
    gameMode: GameMode.Paired,
    matchFormat: { roundsPerSet: 11, bestOf: 1 },
    turnDuration: 30,
    isPrivate: false,
    assisted: true,
    gameRules: {
      floorPenalty: true,
      rekorPenalty: true,
      doubling: false,
    },
  };
}
