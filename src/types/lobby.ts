/**
 * Lobby type definitions.
 *
 * This repository is dedicated to Okey 101 only. Other games will live in their
 * own repositories on separate subdomains, so there is intentionally no
 * multi-game abstraction here — the settings model is flat and Okey-specific.
 *
 * Strict typing: `any` is never used, and fields that must be immutable are
 * marked `readonly`.
 */

/* -------------------------------------------------------------------------- */
/*  Enums                                                                      */
/* -------------------------------------------------------------------------- */

/** How players are matched up. */
export enum GameMode {
  /** Paired — 2 vs 2 team play. */
  Paired = 'PAIRED',
  /** Solo — every player for themselves (free for all). */
  Solo = 'SOLO',
}

/** Status of a lobby within its lifecycle. */
export enum LobbyStatus {
  /** Waiting for players, game not started. */
  Waiting = 'WAITING',
  /** Game in progress. */
  InProgress = 'IN_PROGRESS',
  /** Game finished. */
  Finished = 'FINISHED',
}

/* -------------------------------------------------------------------------- */
/*  Composite helper types                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Turn duration (seconds). For now the common values are constrained via a
 * union; adding a new option only requires adding a value here.
 */
export type TurnDuration = 15 | 30 | 60;

/**
 * Match format. The game is ALWAYS round-based:
 *  - `roundsPerSet` — number of rounds (el) played in a single set.
 *  - `bestOf`       — number of sets in the match. `1` means a flat single set
 *                     (e.g. "play 11 rounds, highest score wins"); `3`/`5` mean
 *                     the set winner earns a set-point and the first to win the
 *                     majority of sets wins the match (e.g. "5 rounds, best of 3").
 */
export interface MatchFormat {
  roundsPerSet: number;
  bestOf: number;
}

/** Okey 101 rule toggles. */
export interface Okey101Rules {
  /** Floor-tile penalties (yere taş atma cezaları). */
  floorPenalty: boolean;
  /** Penalty to the OPPOSING team when opening a 153+ series or 7+ pairs (rekor). */
  rekorPenalty: boolean;
  /** Score doubling (katlama). */
  doubling: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Lobby settings                                                             */
/* -------------------------------------------------------------------------- */

/** All settings chosen when creating a lobby. */
export interface LobbySettings {
  /** Whether the game is played paired or solo. */
  gameMode: GameMode;
  /** Round/set structure of the match. */
  matchFormat: MatchFormat;
  /** Turn duration (seconds). */
  turnDuration: TurnDuration;
  /** Is this a private/password-protected lobby? (The password itself is NOT stored in the settings object.) */
  isPrivate: boolean;
  /** Okey 101 rule toggles. */
  gameRules: Okey101Rules;
}

/* -------------------------------------------------------------------------- */
/*  Lobby entity (Firestore document)                                          */
/* -------------------------------------------------------------------------- */

/** Summary info of a player seated in the lobby. */
export interface LobbyPlayer {
  readonly uid: string;
  readonly displayName: string;
  readonly isHost: boolean;
  /** Team assignment in paired mode (0 | 1); undefined in solo mode. */
  readonly team?: 0 | 1;
}

/**
 * Lobby document stored in Firestore. Wraps the settings (`settings`) plus
 * runtime metadata (players, status, host, etc.).
 *
 * Note: `passwordHash` is only meaningful when `isPrivate === true` and must
 * never be returned to the client as a raw password.
 */
export interface Lobby {
  readonly id: string;
  /** uid of the user who created the lobby. */
  readonly hostId: string;
  /** Lobby name shown in the list. */
  name: string;
  settings: LobbySettings;
  status: LobbyStatus;
  players: readonly LobbyPlayer[];
  /** Maximum number of players allowed. */
  maxPlayers: number;
  /** Hash of the password for private lobbies (optional). */
  passwordHash?: string;
  /** Creation time — epoch milliseconds (set via Firestore serverTimestamp). */
  createdAt: number;
}

/**
 * Raw data produced by the lobby creation form. Fields such as `id`, `hostId`,
 * `players`, and `createdAt` are generated in the server/service layer, so they
 * are not present here. The password (for a private lobby) is received as plain
 * text; hashing is the responsibility of the service layer.
 */
export interface CreateLobbyInput {
  name: string;
  settings: LobbySettings;
  /** Used only when `settings.isPrivate === true`. */
  password?: string;
}
