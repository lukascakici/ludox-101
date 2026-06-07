import { GameMode, type LobbySettings, type TurnDuration } from '@/types/lobby';

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

/** Okey 101 is played by 4 players. */
export const OKEY101_MAX_PLAYERS = 4;

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
    gameRules: {
      floorPenalty: true,
      rekorPenalty: true,
      doubling: false,
    },
  };
}
