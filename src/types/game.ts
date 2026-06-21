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

/**
 * Why a floor penalty (ceza) was written to a player. An evolving set — new
 * conditions are added as new reasons.
 *  - `take-open-*`: a not-yet-opened player took this player's left discard and
 *    used it to FIRST-open (series → ×10, pairs → ×20 of the tile's value).
 *  - `discard-okey`: discarded the okey tile without finishing.
 *  - `discard-processable`: discarded a tile that fits an open meld on the table.
 *  - `held-okey`: still held the okey at round end despite having opened.
 *  - `wrong-open`: attempted an invalid opening (bad meld or below threshold) in
 *    unassisted mode — the move is rejected but the penalty is still written.
 *  - `wrong-process`: attempted to process a tile onto a meld it doesn't fit, in
 *    unassisted mode — likewise rejected but penalized.
 *  - `rekor`: a REWARD (negative points) — the finisher had a rekor opening this
 *    round (7+ pairs, or a 153+ first open) and went on to finish it.
 */
export type PenaltyReason =
  | 'take-open-series'
  | 'take-open-pair'
  | 'discard-okey'
  | 'discard-processable'
  | 'held-okey'
  | 'wrong-open'
  | 'wrong-process'
  | 'rekor';

/** One floor-penalty record (points written TO `uid`, folded into the round delta). */
export interface PenaltyEntry {
  /** uid of the affected player. */
  uid: string;
  reason: PenaltyReason;
  /**
   * Points added to the player's round delta. Positive worsens the score (a
   * penalty); negative improves it (a reward, e.g. the `rekor` bonus).
   */
  points: number;
}

/** The outcome of one finished round, kept for the between-rounds scoreboard. */
export interface RoundResult {
  /** This round's penalty points per player. */
  delta: Record<string, number>;
  /** Running set totals after this round (per player; reset each set). */
  totals: Record<string, number>;
  /** The finisher uid, or absent for a deck-exhausted end. */
  winner?: string;
  /** Why the round ended. */
  reason: 'finish' | 'deck';
  /** Whether a special finish doubled the round. */
  doubled: boolean;
  /** Whether this round completed the current set. */
  setComplete?: boolean;
  /**
   * The side that won the set (lowest set total): a player uid in solo mode, a
   * team key ('0' | '1') in paired mode. Present only when `setComplete`.
   */
  setWinner?: string;
  /** Whether this round completed the whole match (someone won a majority of sets). */
  matchComplete?: boolean;
  /** The side that won the match. Present only when `matchComplete`. */
  matchWinner?: string;
  /** Floor penalties applied during this round (already folded into `delta`). */
  penalties?: PenaltyEntry[];
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
  /** Running penalty per player for the CURRENT set (lower is better; reset each set). */
  scores: Record<string, number>;
  /** Number of rounds (eller) completed in the current set. */
  roundsPlayed: number;
  /** Rounds (el) per set — from the match format. */
  roundsPerSet: number;
  /** Number of sets in the match (bestOf). 1 = flat single set. */
  bestOf: number;
  /** Current set index (0-based). */
  setIndex: number;
  /** Sets won per side (uid in solo, team key '0'|'1' in paired). */
  setsWon: Record<string, number>;
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
  /** Whether floor penalties (cezalar) are enabled for this game. */
  floorPenalty: boolean;
  /** Whether the rekor reward (rekorlu) is enabled (snapshotted at start). */
  rekorPenalty?: boolean;
  /**
   * Players who made a rekor opening THIS round (uid → true): opened with 7+
   * pairs, or made a 153+ first open. Reset each re-deal. The reward is granted
   * at round end only if the rekor opener also finishes the round.
   */
  rekor?: Record<string, boolean>;
  /**
   * Assisted mode (snapshotted from lobby settings at start). When false
   * (desteksiz) the server lets invalid opens/processes through as a rejected
   * move and writes a `wrong-open` / `wrong-process` penalty instead of just
   * blocking. When true (destekli) invalid moves are blocked with no penalty.
   */
  assisted?: boolean;
  /**
   * Okey tiles held per player (public — there are two okeys in the deck).
   * Maintained alongside `handValue` on every hand change so the round-end
   * "held okey" penalty can be applied without reading private hands.
   */
  okeyCount?: Record<string, number>;
  /**
   * Floor penalties accrued in the CURRENT round (e.g. someone opened with your
   * discard). Folded into the round delta at round-end and reset each round.
   */
  penaltyLog?: PenaltyEntry[];
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
