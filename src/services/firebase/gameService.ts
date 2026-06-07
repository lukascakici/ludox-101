import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './config';
import { deal } from '@/game/deal';
import { computeOkey } from '@/game/okey';
import { classifyMeld, OPENING_MIN } from '@/game/melds';
import { LobbyStatus, type Lobby, type LobbyPlayer } from '@/types/lobby';
import type { GameState, PlayerHand, TableMeld } from '@/types/game';
import type { Tile } from '@/game/tiles';

const GAMES_COLLECTION = 'games';
const LOBBIES_COLLECTION = 'lobbies';

/**
 * Starts the game: the host deals once and writes the shared state to Firestore
 * in a single batch — the public game doc, one private hand doc per player, the
 * draw pile, an initial 'deal' move, and flips the lobby to InProgress.
 *
 * The starter holds the extra tile, so the round opens in the 'discard' phase.
 */
export async function startGame(lobby: Lobby, hostUid: string): Promise<void> {
  const playerOrder = lobby.players.map((player) => player.uid);
  const result = deal();
  const okey = computeOkey(result.indicator.face);

  const handCounts: Record<string, number> = {};
  playerOrder.forEach((uid, seat) => {
    handCounts[uid] = result.hands[seat]?.length ?? 0;
  });

  const discards: Record<string, Tile[]> = {};
  for (let seat = 0; seat < playerOrder.length; seat++) {
    discards[String(seat)] = [];
  }

  const gameState: GameState = {
    status: 'playing',
    playerOrder,
    starterIndex: result.starterIndex,
    turnIndex: result.starterIndex,
    turnPhase: 'discard',
    indicator: result.indicator.face,
    okey,
    drawCount: result.drawPile.length,
    discards,
    handCounts,
    opened: {},
    melds: [],
    doubling: lobby.settings.gameRules.doubling,
  };

  const batch = writeBatch(db);
  const gameRef = doc(db, GAMES_COLLECTION, lobby.id);

  batch.set(gameRef, { ...gameState, createdAt: serverTimestamp() });

  result.hands.forEach((hand, seat) => {
    const uid = playerOrder[seat];
    const handDoc: PlayerHand = { tiles: hand };
    batch.set(doc(gameRef, 'hands', uid), handDoc);
  });

  batch.set(doc(gameRef, 'private', 'deck'), { tiles: result.drawPile });

  batch.set(doc(collection(gameRef, 'moves')), {
    type: 'deal',
    by: hostUid,
    at: serverTimestamp(),
    indicator: result.indicator.face,
    starterIndex: result.starterIndex,
    drawCount: result.drawPile.length,
  });

  batch.update(doc(db, LOBBIES_COLLECTION, lobby.id), {
    status: LobbyStatus.InProgress,
  });

  await batch.commit();
}

/* -------------------------------------------------------------------------- */
/*  Dev test harness — fill a lobby with bots and auto-play their turns.        */
/*  Bots use uids like `bot-1`; a Firestore rule lets bot hands be read so a    */
/*  single tester can drive the whole table.                                    */
/* -------------------------------------------------------------------------- */

/** Fills the lobby up to 4 with bots and starts the game (dev/testing only). */
export async function startSoloTestGame(
  lobby: Lobby,
  hostUid: string,
): Promise<void> {
  const botCount = Math.max(0, 4 - lobby.players.length);
  const bots: LobbyPlayer[] = Array.from({ length: botCount }, (_, i) => ({
    uid: `bot-${i + 1}`,
    displayName: `Bot ${i + 1}`,
    isHost: false,
  }));
  const players = [...lobby.players, ...bots];
  const playerOrder = players.map((player) => player.uid);

  const result = deal();
  const okey = computeOkey(result.indicator.face);

  const handCounts: Record<string, number> = {};
  playerOrder.forEach((uid, seat) => {
    handCounts[uid] = result.hands[seat]?.length ?? 0;
  });
  const discards: Record<string, Tile[]> = {};
  for (let seat = 0; seat < playerOrder.length; seat++) {
    discards[String(seat)] = [];
  }

  const gameState: GameState = {
    status: 'playing',
    playerOrder,
    starterIndex: result.starterIndex,
    turnIndex: result.starterIndex,
    turnPhase: 'discard',
    indicator: result.indicator.face,
    okey,
    drawCount: result.drawPile.length,
    discards,
    handCounts,
    opened: {},
    melds: [],
    doubling: lobby.settings.gameRules.doubling,
  };

  const batch = writeBatch(db);
  const gameRef = doc(db, GAMES_COLLECTION, lobby.id);
  batch.set(gameRef, { ...gameState, createdAt: serverTimestamp() });
  result.hands.forEach((hand, seat) => {
    batch.set(doc(gameRef, 'hands', playerOrder[seat]), { tiles: hand });
  });
  batch.set(doc(gameRef, 'private', 'deck'), { tiles: result.drawPile });
  batch.set(doc(collection(gameRef, 'moves')), {
    type: 'deal',
    by: hostUid,
    at: serverTimestamp(),
  });
  batch.update(doc(db, LOBBIES_COLLECTION, lobby.id), {
    players,
    playerUids: players.map((player) => player.uid),
    status: LobbyStatus.InProgress,
  });

  await batch.commit();
}

/** Reads a player's hand directly (used by the bot auto-player). */
async function getHand(lobbyId: string, uid: string): Promise<Tile[]> {
  const snapshot = await getDoc(
    doc(db, GAMES_COLLECTION, lobbyId, 'hands', uid),
  );
  return snapshot.exists() ? (snapshot.data() as PlayerHand).tiles : [];
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Plays consecutive bot turns until it's a human's turn again (dev only). */
export async function playPendingBotTurns(lobbyId: string): Promise<void> {
  for (let guard = 0; guard < 20; guard++) {
    const snapshot = await getDoc(doc(db, GAMES_COLLECTION, lobbyId));
    if (!snapshot.exists()) return;

    const game = snapshot.data() as GameState;
    if (game.status !== 'playing') return;
    const current = game.playerOrder[game.turnIndex];
    if (!current.startsWith('bot')) return;

    await wait(500);
    if (game.turnPhase === 'draw') {
      if (game.drawCount > 0) await drawFromDeck(lobbyId, current);
      else await takeFromDiscard(lobbyId, current);
    }

    const hand = await getHand(lobbyId, current);
    if (hand.length === 0) return;
    const tile = hand[Math.floor(Math.random() * hand.length)];
    await wait(500);
    await discardTile(lobbyId, current, tile.id);
  }
}

/**
 * Opens (lays) melds on the table. Validates each group as a meld and requires
 * the total to reach the opening threshold (≥101). Removes the tiles from the
 * hand, keeping at least one to discard. The turn is NOT advanced — the player
 * still discards afterwards.
 */
export async function openMelds(
  lobbyId: string,
  uid: string,
  groups: Tile[][],
): Promise<void> {
  const gameRef = doc(db, GAMES_COLLECTION, lobbyId);
  const handRef = doc(gameRef, 'hands', uid);

  await runTransaction(db, async (tx) => {
    const [gameSnap, handSnap] = await Promise.all([
      tx.get(gameRef),
      tx.get(handRef),
    ]);
    if (!gameSnap.exists() || !handSnap.exists()) {
      throw new GameActionError('missing');
    }

    const game = gameSnap.data() as GameState;
    if (game.playerOrder[game.turnIndex] !== uid) {
      throw new GameActionError('not-your-turn');
    }
    if (game.turnPhase !== 'discard') throw new GameActionError('wrong-phase');

    const alreadyOpened = (game.opened ?? {})[uid] === true;
    const existingMelds = game.melds ?? [];

    let total = 0;
    const tableMelds: TableMeld[] = [];
    groups.forEach((group, index) => {
      const info = classifyMeld(
        group.map((tile) => tile.face),
        game.okey,
      );
      if (!info) throw new GameActionError('invalid-meld');
      total += info.value;
      tableMelds.push({
        id: `${uid}-${existingMelds.length + index}`,
        owner: uid,
        kind: info.kind,
        tiles: group,
      });
    });
    // The 101 threshold only applies to the FIRST opening.
    if (!alreadyOpened && total < OPENING_MIN) {
      throw new GameActionError('below-threshold');
    }

    const openedIds = new Set(groups.flat().map((tile) => tile.id));
    const handTiles = (handSnap.data() as PlayerHand).tiles;
    const remaining = handTiles.filter((tile) => !openedIds.has(tile.id));
    if (handTiles.length - remaining.length !== openedIds.size) {
      throw new GameActionError('tile-not-in-hand');
    }
    if (remaining.length < 1) throw new GameActionError('must-keep-tile');

    tx.update(handRef, { tiles: remaining });
    tx.update(gameRef, {
      melds: [...existingMelds, ...tableMelds],
      [`opened.${uid}`]: true,
      [`handCounts.${uid}`]: remaining.length,
    });
    tx.set(doc(collection(gameRef, 'moves')), {
      type: 'open',
      by: uid,
      at: serverTimestamp(),
      total,
    });
  });
}

/**
 * "İşleme": adds a tile from the player's hand to an existing meld on the table
 * (any owner). The player must have opened, and the resulting meld must still be
 * valid. Keeps at least one tile to discard.
 */
export async function processTile(
  lobbyId: string,
  uid: string,
  meldId: string,
  tileId: string,
): Promise<void> {
  const gameRef = doc(db, GAMES_COLLECTION, lobbyId);
  const handRef = doc(gameRef, 'hands', uid);

  await runTransaction(db, async (tx) => {
    const [gameSnap, handSnap] = await Promise.all([
      tx.get(gameRef),
      tx.get(handRef),
    ]);
    if (!gameSnap.exists() || !handSnap.exists()) {
      throw new GameActionError('missing');
    }

    const game = gameSnap.data() as GameState;
    if (game.playerOrder[game.turnIndex] !== uid) {
      throw new GameActionError('not-your-turn');
    }
    if (game.turnPhase !== 'discard') throw new GameActionError('wrong-phase');
    if (!(game.opened ?? {})[uid]) throw new GameActionError('not-opened');

    const melds = game.melds ?? [];
    const meldIndex = melds.findIndex((meld) => meld.id === meldId);
    if (meldIndex < 0) throw new GameActionError('meld-not-found');

    const handTiles = (handSnap.data() as PlayerHand).tiles;
    const tile = handTiles.find((t) => t.id === tileId);
    if (!tile) throw new GameActionError('tile-not-in-hand');

    const target = melds[meldIndex];
    const newTiles = [...target.tiles, tile];
    const info = classifyMeld(
      newTiles.map((t) => t.face),
      game.okey,
    );
    if (!info) throw new GameActionError('invalid-meld');

    const remaining = handTiles.filter((t) => t.id !== tileId);
    if (remaining.length < 1) throw new GameActionError('must-keep-tile');

    const newMelds = melds.map((meld, index) =>
      index === meldIndex ? { ...meld, tiles: newTiles, kind: info.kind } : meld,
    );

    tx.update(handRef, { tiles: remaining });
    tx.update(gameRef, {
      melds: newMelds,
      [`handCounts.${uid}`]: remaining.length,
    });
    tx.set(doc(collection(gameRef, 'moves')), {
      type: 'process',
      by: uid,
      at: serverTimestamp(),
      meldId,
      tile: tile.face,
    });
  });
}

/** Subscribes to the public game state. Calls back with `null` if no game yet. */
export function subscribeToGame(
  lobbyId: string,
  onChange: (game: GameState | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, GAMES_COLLECTION, lobbyId),
    (snapshot) => {
      onChange(snapshot.exists() ? (snapshot.data() as GameState) : null);
    },
    (error) => onError?.(error),
  );
}

/** Reasons a draw/discard can fail (surfaced for logging; UI gates most cases). */
export class GameActionError extends Error {
  constructor(
    readonly code:
      | 'not-your-turn'
      | 'wrong-phase'
      | 'deck-empty'
      | 'empty-discard'
      | 'tile-not-in-hand'
      | 'already-opened'
      | 'invalid-meld'
      | 'below-threshold'
      | 'must-keep-tile'
      | 'not-opened'
      | 'meld-not-found'
      | 'missing',
  ) {
    super(code);
    this.name = 'GameActionError';
  }
}

/**
 * Draws the top tile of the deck into the player's hand and moves the turn into
 * the discard phase. Runs in a transaction so the deck, hand, and game stay
 * consistent.
 */
export async function drawFromDeck(lobbyId: string, uid: string): Promise<void> {
  const gameRef = doc(db, GAMES_COLLECTION, lobbyId);
  const deckRef = doc(gameRef, 'private', 'deck');
  const handRef = doc(gameRef, 'hands', uid);

  await runTransaction(db, async (tx) => {
    const [gameSnap, deckSnap, handSnap] = await Promise.all([
      tx.get(gameRef),
      tx.get(deckRef),
      tx.get(handRef),
    ]);
    if (!gameSnap.exists() || !deckSnap.exists() || !handSnap.exists()) {
      throw new GameActionError('missing');
    }

    const game = gameSnap.data() as GameState;
    if (game.playerOrder[game.turnIndex] !== uid) {
      throw new GameActionError('not-your-turn');
    }
    if (game.turnPhase !== 'draw') throw new GameActionError('wrong-phase');

    const deckTiles = (deckSnap.data().tiles as Tile[]) ?? [];
    if (deckTiles.length === 0) throw new GameActionError('deck-empty');

    const drawn = deckTiles[deckTiles.length - 1];
    const remaining = deckTiles.slice(0, -1);
    const newHand = [...(handSnap.data() as PlayerHand).tiles, drawn];

    tx.update(deckRef, { tiles: remaining });
    tx.update(handRef, { tiles: newHand });
    // When the last tile is drawn, the hand ends automatically.
    tx.update(gameRef, {
      drawCount: remaining.length,
      [`handCounts.${uid}`]: newHand.length,
      turnPhase: 'discard',
      ...(remaining.length === 0 ? { status: 'finished' } : {}),
    });
    tx.set(doc(collection(gameRef, 'moves')), {
      type: 'draw',
      by: uid,
      at: serverTimestamp(),
      tile: drawn.face,
    });
  });
}

/**
 * Takes the top tile of the LEFT neighbour's discard pile into the player's
 * hand (the alternative to drawing from the deck), moving into the discard
 * phase. In Okey each player may only take from the player on their left.
 */
export async function takeFromDiscard(
  lobbyId: string,
  uid: string,
): Promise<void> {
  const gameRef = doc(db, GAMES_COLLECTION, lobbyId);
  const handRef = doc(gameRef, 'hands', uid);

  await runTransaction(db, async (tx) => {
    const [gameSnap, handSnap] = await Promise.all([
      tx.get(gameRef),
      tx.get(handRef),
    ]);
    if (!gameSnap.exists() || !handSnap.exists()) {
      throw new GameActionError('missing');
    }

    const game = gameSnap.data() as GameState;
    if (game.playerOrder[game.turnIndex] !== uid) {
      throw new GameActionError('not-your-turn');
    }
    if (game.turnPhase !== 'draw') throw new GameActionError('wrong-phase');

    const count = game.playerOrder.length;
    const myIndex = game.playerOrder.indexOf(uid);
    const leftSeat = String((myIndex - 1 + count) % count);
    const pile = game.discards[leftSeat] ?? [];
    if (pile.length === 0) throw new GameActionError('empty-discard');

    const taken = pile[pile.length - 1];
    const newHand = [...(handSnap.data() as PlayerHand).tiles, taken];

    tx.update(handRef, { tiles: newHand });
    tx.update(gameRef, {
      [`discards.${leftSeat}`]: pile.slice(0, -1),
      [`handCounts.${uid}`]: newHand.length,
      turnPhase: 'discard',
    });
    tx.set(doc(collection(gameRef, 'moves')), {
      type: 'take',
      by: uid,
      at: serverTimestamp(),
      tile: taken.face,
    });
  });
}

/**
 * Discards a tile from the player's hand to their discard pile and passes the
 * turn to the next player (whose turn opens in the draw phase).
 */
export async function discardTile(
  lobbyId: string,
  uid: string,
  tileId: string,
): Promise<void> {
  const gameRef = doc(db, GAMES_COLLECTION, lobbyId);
  const handRef = doc(gameRef, 'hands', uid);

  await runTransaction(db, async (tx) => {
    const [gameSnap, handSnap] = await Promise.all([
      tx.get(gameRef),
      tx.get(handRef),
    ]);
    if (!gameSnap.exists() || !handSnap.exists()) {
      throw new GameActionError('missing');
    }

    const game = gameSnap.data() as GameState;
    if (game.playerOrder[game.turnIndex] !== uid) {
      throw new GameActionError('not-your-turn');
    }
    if (game.turnPhase !== 'discard') throw new GameActionError('wrong-phase');

    const handTiles = (handSnap.data() as PlayerHand).tiles;
    const index = handTiles.findIndex((tile) => tile.id === tileId);
    if (index < 0) throw new GameActionError('tile-not-in-hand');

    const tile = handTiles[index];
    const newHand = [
      ...handTiles.slice(0, index),
      ...handTiles.slice(index + 1),
    ];

    const seat = String(game.playerOrder.indexOf(uid));
    const pile = game.discards[seat] ?? [];
    const nextTurn = (game.turnIndex + 1) % game.playerOrder.length;

    // Finishing (el bitirme): discarding the last tile after having opened wins.
    const finished =
      newHand.length === 0 && (game.opened ?? {})[uid] === true;

    tx.update(handRef, { tiles: newHand });
    tx.update(gameRef, {
      [`discards.${seat}`]: [...pile, tile],
      [`handCounts.${uid}`]: newHand.length,
      ...(finished
        ? { status: 'finished', winner: uid }
        : { turnIndex: nextTurn, turnPhase: 'draw' }),
    });
    tx.set(doc(collection(gameRef, 'moves')), {
      type: 'discard',
      by: uid,
      at: serverTimestamp(),
      tile: tile.face,
    });
  });
}

/** Subscribes to the current player's private hand (only they can read it). */
export function subscribeToHand(
  lobbyId: string,
  uid: string,
  onChange: (tiles: Tile[] | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, GAMES_COLLECTION, lobbyId, 'hands', uid),
    (snapshot) => {
      const data = snapshot.data() as PlayerHand | undefined;
      onChange(data ? data.tiles : null);
    },
    (error) => onError?.(error),
  );
}
