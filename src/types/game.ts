import type { Tile, TileFace } from '@/game/tiles';
import type { OkeyMatch } from '@/game/okey';
import type { MeldKind } from '@/game/melds';

/** A meld laid on the table (open area). */
export interface TableMeld {
  id: string;
  /** uid of the player who laid it. */
  owner: string;
  kind: MeldKind;
  tiles: Tile[];
}

/** The outcome of one finished round, kept for the between-rounds scoreboard. */
export interface RoundResult {
  /** This round's penalty points per player. */
  delta: Record<string, number>;
  /** Cumulative match totals after this round. */
  totals: Record<string, number>;
  /** The finisher uid, or absent for a deck-exhausted end. */
  winner?: string;
  /** Why the round ended. */
  reason: 'finish' | 'deck';
  /** Whether a special finish doubled the round. */
  doubled: boolean;
}

/**
 * A tentative take of the left neighbour's discard by a not-yet-opened player.
 * The tile sits in their hand on loan: they must OPEN this turn to commit it, or
 * return it to the pile. While set, the owner can't draw/discard — only open or
 * return.
 */
export interface PendingTake {
  /** uid of the player who tentatively took the tile. */
  uid: string;
  /** The borrowed tile. */
  tile: Tile;
  /** Seat index (as a string) of the pile it came from (the left neighbour). */
  fromSeat: string;
}

/** A turn has two phases: first draw a tile, then discard one. */
export type TurnPhase = 'draw' | 'discard';

export type GameStatus = 'playing' | 'finished';

/**
 * Public game state (Firestore `games/{lobbyId}`). Readable by all participants.
 * Hand CONTENTS are private (separate per-player docs); only counts are public.
 */
export interface GameState {
  status: GameStatus;
  /** Player uids in seat order. */
  playerOrder: string[];
  starterIndex: number;
  /** Index into `playerOrder` whose turn it is. */
  turnIndex: number;
  turnPhase: TurnPhase;
  indicator: TileFace;
  okey: OkeyMatch | null;
  /** Tiles left in the draw pile (count is public; contents are not). */
  drawCount: number;
  /** Discards per seat index ('0'..'3'). A map, since Firestore forbids nested arrays. */
  discards: Record<string, Tile[]>;
  /** Tile count per player uid (public, so opponents' counts are visible). */
  handCounts: Record<string, number>;
  /**
   * Held-tile value per player (public), maintained as tiles move so the round
   * can be scored at the end without reading anyone's private hand.
   */
  handValue: Record<string, number>;
  /** Cumulative match penalty per player (lower is better). */
  scores: Record<string, number>;
  /** Number of rounds (eller) completed in this match. */
  roundsPlayed: number;
  /** The most recently finished round's result (shown between rounds). */
  roundResult?: RoundResult;
  /** Whether each player has made their opening meld. */
  opened: Record<string, boolean>;
  /**
   * How each player opened: 'meld' (perlerle) or 'pair' (çiftlerle). A pair
   * opener may not lay new melds afterwards; a meld opener may add pairs only
   * once a pairs area exists. Absent for players who haven't opened yet.
   */
  openedWith: Record<string, 'meld' | 'pair'>;
  /** Melds laid on the table. */
  melds: TableMeld[];
  /** Whether doubling (katlama) is on — affects the opening threshold. */
  doubling: boolean;
  /**
   * Team per player uid (0 | 1) in paired (eşli) mode; absent in solo mode.
   * Partners sit across the table (seats 0&2 vs 1&3). Used for team scoring.
   */
  teams?: Record<string, 0 | 1>;
  /** uid of the winner once someone finishes (empty otherwise). */
  winner?: string;
  /** A tentative left-discard take awaiting open-or-return (absent if none). */
  pendingTake?: PendingTake;
}

/** A player's private hand (Firestore `games/{lobbyId}/hands/{uid}`). */
export interface PlayerHand {
  tiles: Tile[];
}

export type MoveType =
  | 'deal'
  | 'draw'
  | 'discard'
  | 'take'
  | 'return'
  | 'open'
  | 'process';

/** An entry in the move log (Firestore `games/{lobbyId}/moves`). */
export interface GameMove {
  type: MoveType;
  /** uid of the player who made the move. */
  by: string;
  /** The tile involved (for draw/discard). */
  tile?: TileFace;
}
