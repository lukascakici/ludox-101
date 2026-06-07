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
  /** Whether each player has made their opening meld. */
  opened: Record<string, boolean>;
  /** Melds laid on the table. */
  melds: TableMeld[];
  /** Whether doubling (katlama) is on — affects the opening threshold. */
  doubling: boolean;
}

/** A player's private hand (Firestore `games/{lobbyId}/hands/{uid}`). */
export interface PlayerHand {
  tiles: Tile[];
}

export type MoveType = 'deal' | 'draw' | 'discard' | 'take' | 'open';

/** An entry in the move log (Firestore `games/{lobbyId}/moves`). */
export interface GameMove {
  type: MoveType;
  /** uid of the player who made the move. */
  by: string;
  /** The tile involved (for draw/discard). */
  tile?: TileFace;
}
