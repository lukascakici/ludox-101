/**
 * Lobby type definitions.
 *
 * Design goal: the system must be able to grow WITHOUT breaking when new games
 * (Tavla, Batak, ...) and new rules are added later. Therefore:
 *  - Common lobby settings are grouped under `BaseLobbySettings`.
 *  - Game-specific rules are declared in the `GameRulesMap` registry; adding a
 *    new game means adding a new key to that map (Open/Closed Principle).
 *
 * Strict typing: `any` is never used, and fields that must be immutable are
 * marked `readonly`.
 */

/* -------------------------------------------------------------------------- */
/*  Enums                                                                      */
/* -------------------------------------------------------------------------- */

/** Game types playable on the platform. */
export enum GameType {
  Okey101 = 'OKEY_101',
  Tavla = 'TAVLA',
  Batak = 'BATAK',
}

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

/* -------------------------------------------------------------------------- */
/*  Game-specific rules (extensible registry)                                  */
/* -------------------------------------------------------------------------- */

/**
 * Common base shared by all game rule types. If a shared field is needed later,
 * it can be added in one place.
 */
export interface BaseGameRules {
  /** Reserved for future shared fields. */
  readonly _placeholder?: never;
}

/** Okey 101-specific rules. */
export interface Okey101Rules extends BaseGameRules {
  /** Floor-tile penalties (yere taş atma cezaları). */
  floorPenalty: boolean;
  /** Penalty to the OPPOSING team when opening a 150+ series or 7+ pairs (rekor). */
  rekorPenalty: boolean;
  /** Score doubling (katlama). */
  doubling: boolean;
}

/** Tavla-specific rules. (To be filled in when Tavla is implemented.) */
export interface TavlaRules extends BaseGameRules {
  readonly _placeholder?: never;
}

/** Batak-specific rules. (To be filled in when Batak is implemented.) */
export interface BatakRules extends BaseGameRules {
  readonly _placeholder?: never;
}

/**
 * Game type -> rule type mapping (registry).
 * STEPS TO ADD A NEW GAME:
 *   1) Add a value to the `GameType` enum.
 *   2) Define the corresponding `XxxRules` interface.
 *   3) Add a line to this map.
 * The type system expands automatically without touching anything else.
 */
export interface GameRulesMap {
  [GameType.Okey101]: Okey101Rules;
  [GameType.Tavla]: TavlaRules;
  [GameType.Batak]: BatakRules;
}

/* -------------------------------------------------------------------------- */
/*  Lobby settings                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Common lobby settings shared by all games.
 * Game-specific rules are intentionally kept NOT here, but inside
 * `LobbySettings.gameRules`.
 */
export interface BaseLobbySettings {
  /** Whether the game is played paired or solo. */
  gameMode: GameMode;
  /** Round/set structure of the match. */
  matchFormat: MatchFormat;
  /** Turn duration (seconds). */
  turnDuration: TurnDuration;
  /** Is this a private/password-protected lobby? (The password itself is NOT stored in the settings object.) */
  isPrivate: boolean;
}

/**
 * Full lobby settings. Being parameterized by `T`, it binds `gameType` to
 * `gameRules`: assigning the wrong game's rules produces a compile error.
 *
 * @example
 * const s: LobbySettings<GameType.Okey101> = {
 *   gameType: GameType.Okey101,
 *   gameMode: GameMode.Paired,
 *   matchFormat: { roundsPerSet: 5, bestOf: 3 },
 *   turnDuration: 30,
 *   isPrivate: false,
 *   gameRules: { floorPenalty: true, rekorPenalty: true, doubling: false },
 * };
 */
export interface LobbySettings<T extends GameType = GameType>
  extends BaseLobbySettings {
  readonly gameType: T;
  gameRules: GameRulesMap[T];
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
  /** Maximum number of players allowed for this game type. */
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
