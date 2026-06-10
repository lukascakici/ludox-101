import {
  collection,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './config';
import { deal } from '@/game/deal';
import { computeOkey, isOkeyTile } from '@/game/okey';
import { classifyMeld, isPair, OPENING_MIN, PAIRS_MIN } from '@/game/melds';
import { orderMeld } from '@/game/arrange';
import { handValueOf, scoreRound, tileValue } from '@/game/scoring';
import { emptierTeam, seatOrderForGame, teamOf } from '@/constants/lobby';
import {
  GameMode,
  LobbyStatus,
  type Lobby,
  type LobbyPlayer,
} from '@/types/lobby';
import type {
  GameState,
  PlayerHand,
  RoundResult,
  TableMeld,
} from '@/types/game';
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
  const paired = lobby.settings.gameMode === GameMode.Paired;
  // Seat partners across the table (team0, team1, team0, team1).
  const seated = seatOrderForGame(lobby.players, lobby.settings.gameMode);
  const playerOrder = seated.map((player) => player.uid);
  const teams: Record<string, 0 | 1> = {};
  if (paired) seated.forEach((player) => (teams[player.uid] = teamOf(player)));
  const result = deal();
  const okey = computeOkey(result.indicator.face);

  const handCounts: Record<string, number> = {};
  const handValue: Record<string, number> = {};
  const scores: Record<string, number> = {};
  playerOrder.forEach((uid, seat) => {
    handCounts[uid] = result.hands[seat]?.length ?? 0;
    handValue[uid] = handValueOf(result.hands[seat] ?? [], okey);
    scores[uid] = 0;
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
    handValue,
    scores,
    roundsPlayed: 0,
    opened: {},
    openedWith: {},
    melds: [],
    doubling: lobby.settings.gameRules.doubling,
    ...(paired ? { teams } : {}),
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

/**
 * Pads a player list up to 4 with bots. In paired mode each bot is dropped into
 * whichever team still has an open slot, so the table ends up 2 vs 2.
 */
function fillBots(
  existing: readonly LobbyPlayer[],
  paired: boolean,
): LobbyPlayer[] {
  const players: LobbyPlayer[] = [...existing];
  const botCount = Math.max(0, 4 - players.length);
  for (let i = 0; i < botCount; i++) {
    const bot: LobbyPlayer = {
      uid: `bot-${i + 1}`,
      displayName: `Bot ${i + 1}`,
      isHost: false,
      ...(paired ? { team: emptierTeam(players) } : {}),
    };
    players.push(bot);
  }
  return players;
}

/**
 * Seats bots into the lobby (up to 4) WITHOUT starting the game, so the host can
 * arrange the teams in the lobby UI and then start normally. Dev/testing only.
 */
export async function fillLobbyWithBots(lobby: Lobby): Promise<void> {
  const paired = lobby.settings.gameMode === GameMode.Paired;
  const players = fillBots(lobby.players, paired);
  await updateDoc(doc(db, LOBBIES_COLLECTION, lobby.id), {
    players,
    playerUids: players.map((player) => player.uid),
  });
}

/** Fills the lobby up to 4 with bots and starts the game (dev/testing only). */
export async function startSoloTestGame(
  lobby: Lobby,
  hostUid: string,
): Promise<void> {
  const paired = lobby.settings.gameMode === GameMode.Paired;
  const players = fillBots(lobby.players, paired);
  // Seat partners across the table in paired mode; keep order otherwise.
  const seated = seatOrderForGame(players, lobby.settings.gameMode);
  const playerOrder = seated.map((player) => player.uid);
  const teams: Record<string, 0 | 1> = {};
  if (paired) seated.forEach((player) => (teams[player.uid] = teamOf(player)));

  const result = deal();
  const okey = computeOkey(result.indicator.face);

  const handCounts: Record<string, number> = {};
  const handValue: Record<string, number> = {};
  const scores: Record<string, number> = {};
  playerOrder.forEach((uid, seat) => {
    handCounts[uid] = result.hands[seat]?.length ?? 0;
    handValue[uid] = handValueOf(result.hands[seat] ?? [], okey);
    scores[uid] = 0;
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
    handValue,
    scores,
    roundsPlayed: 0,
    opened: {},
    openedWith: {},
    melds: [],
    doubling: lobby.settings.gameRules.doubling,
    ...(paired ? { teams } : {}),
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
    players: seated,
    playerUids: seated.map((player) => player.uid),
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
    // A player who opened with pairs may never lay normal melds afterwards.
    if (alreadyOpened && (game.openedWith ?? {})[uid] === 'pair') {
      throw new GameActionError('pairs-no-meld');
    }
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
        tiles: orderMeld(group, game.okey),
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

    const laidValue = handValueOf(groups.flat(), game.okey);
    // Opening commits any tentatively-taken left tile.
    // TODO(penalty): if `committedTake`, the discarder (game.pendingTake.fromSeat)
    // owes a penalty of tileValue(game.pendingTake.tile) × 10 for a SERIES open.
    // Only on this first open (pendingTake is never set for already-opened players).
    const committedTake = game.pendingTake?.uid === uid;
    tx.update(handRef, { tiles: remaining });
    tx.update(gameRef, {
      melds: [...existingMelds, ...tableMelds],
      [`opened.${uid}`]: true,
      // Record the opening kind only on the FIRST open (don't overwrite later).
      ...(alreadyOpened ? {} : { [`openedWith.${uid}`]: 'meld' }),
      [`handCounts.${uid}`]: remaining.length,
      [`handValue.${uid}`]: (game.handValue?.[uid] ?? 0) - laidValue,
      ...(committedTake ? { pendingTake: deleteField() } : {}),
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
 * Lays pairs (çift) on the table. The FIRST time this opens the player (≥5
 * pairs, openedWith='pair'). Afterwards it adds more pairs to the shared pairs
 * area. A meld opener may add pairs only once a pairs area already exists
 * (someone has opened with pairs). Keeps at least one tile to discard.
 */
export async function layPairs(
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

    if (groups.length === 0) throw new GameActionError('invalid-pair');
    for (const group of groups) {
      if (!isPair(group.map((tile) => tile.face), game.okey)) {
        throw new GameActionError('invalid-pair');
      }
    }

    const alreadyOpened = (game.opened ?? {})[uid] === true;
    const existingMelds = game.melds ?? [];
    const pairsAreaExists = existingMelds.some((meld) => meld.kind === 'pair');

    if (!alreadyOpened) {
      // Opening with pairs requires reaching the pairs threshold.
      if (groups.length < PAIRS_MIN) {
        throw new GameActionError('pairs-below-threshold');
      }
    } else if ((game.openedWith ?? {})[uid] !== 'pair' && !pairsAreaExists) {
      // A meld opener may only add pairs once a pairs area exists on the table.
      throw new GameActionError('no-pairs-area');
    }

    const pairMelds: TableMeld[] = groups.map((group, index) => ({
      id: `${uid}-p-${existingMelds.length + index}`,
      owner: uid,
      kind: 'pair',
      tiles: group,
    }));

    const usedIds = new Set(groups.flat().map((tile) => tile.id));
    const handTiles = (handSnap.data() as PlayerHand).tiles;
    const remaining = handTiles.filter((tile) => !usedIds.has(tile.id));
    if (handTiles.length - remaining.length !== usedIds.size) {
      throw new GameActionError('tile-not-in-hand');
    }
    if (remaining.length < 1) throw new GameActionError('must-keep-tile');

    const laidValue = handValueOf(groups.flat(), game.okey);
    // Opening with pairs commits any tentatively-taken left tile.
    // TODO(penalty): if `committedTake`, the discarder (game.pendingTake.fromSeat)
    // owes a penalty of tileValue(game.pendingTake.tile) × 20 for a PAIRS open.
    const committedTake = game.pendingTake?.uid === uid;
    tx.update(handRef, { tiles: remaining });
    tx.update(gameRef, {
      melds: [...existingMelds, ...pairMelds],
      [`opened.${uid}`]: true,
      // Record 'pair' only when this lay is the player's first opening.
      ...(alreadyOpened ? {} : { [`openedWith.${uid}`]: 'pair' }),
      [`handCounts.${uid}`]: remaining.length,
      [`handValue.${uid}`]: (game.handValue?.[uid] ?? 0) - laidValue,
      ...(committedTake ? { pendingTake: deleteField() } : {}),
    });
    tx.set(doc(collection(gameRef, 'moves')), {
      type: 'open',
      by: uid,
      at: serverTimestamp(),
      pairs: groups.length,
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
    const combined = [...target.tiles, tile];
    const info = classifyMeld(
      combined.map((t) => t.face),
      game.okey,
    );
    if (!info) throw new GameActionError('invalid-meld');

    const remaining = handTiles.filter((t) => t.id !== tileId);
    if (remaining.length < 1) throw new GameActionError('must-keep-tile');

    // Order the meld so the new tile sits in its proper place (e.g. 4 before 5-6-7).
    const orderedTiles = orderMeld(combined, game.okey);
    const newMelds = melds.map((meld, index) =>
      index === meldIndex
        ? { ...meld, tiles: orderedTiles, kind: info.kind }
        : meld,
    );

    tx.update(handRef, { tiles: remaining });
    tx.update(gameRef, {
      melds: newMelds,
      [`handCounts.${uid}`]: remaining.length,
      [`handValue.${uid}`]:
        (game.handValue?.[uid] ?? 0) - tileValue(tile.face, game.okey),
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

/**
 * Auto-işleme: repeatedly finds a hand tile that fits some table meld and
 * processes it, keeping at least one tile to discard. Reads fresh state each
 * round (melds change as tiles are added).
 */
export async function autoProcess(lobbyId: string, uid: string): Promise<void> {
  const gameRef = doc(db, GAMES_COLLECTION, lobbyId);
  const handRef = doc(gameRef, 'hands', uid);

  for (let guard = 0; guard < 40; guard++) {
    const [gameSnap, handSnap] = await Promise.all([
      getDoc(gameRef),
      getDoc(handRef),
    ]);
    if (!gameSnap.exists() || !handSnap.exists()) return;

    const game = gameSnap.data() as GameState;
    if (game.playerOrder[game.turnIndex] !== uid) return;
    if (game.turnPhase !== 'discard') return;
    if (!(game.opened ?? {})[uid]) return;

    const handTiles = (handSnap.data() as PlayerHand).tiles;
    if (handTiles.length <= 1) return; // keep one to discard

    const melds = game.melds ?? [];
    let move: { meldId: string; tileId: string } | null = null;
    for (const tile of handTiles) {
      for (const meld of melds) {
        const valid = classifyMeld(
          [...meld.tiles, tile].map((t) => t.face),
          game.okey,
        );
        if (valid) {
          move = { meldId: meld.id, tileId: tile.id };
          break;
        }
      }
      if (move) break;
    }
    if (!move) return;

    await processTile(lobbyId, uid, move.meldId, move.tileId);
  }
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
      | 'invalid-pair'
      | 'below-threshold'
      | 'pairs-below-threshold'
      | 'pairs-no-meld'
      | 'no-pairs-area'
      | 'must-keep-tile'
      | 'not-opened'
      | 'meld-not-found'
      | 'must-resolve-take'
      | 'no-pending-take'
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
    // The player who draws the last tile still gets to play; the hand ends when
    // they discard (handled in discardTile).
    tx.update(gameRef, {
      drawCount: remaining.length,
      [`handCounts.${uid}`]: newHand.length,
      [`handValue.${uid}`]:
        (game.handValue?.[uid] ?? 0) + tileValue(drawn.face, game.okey),
      turnPhase: 'discard',
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

    // A not-yet-opened player takes the left tile only TENTATIVELY: they must
    // open this turn (which commits it) or return it. An already-opened player
    // takes it outright. When the deck is empty there's no "draw instead"
    // fallback, so the take must commit immediately (avoids a deadlock and keeps
    // the deck-exhausted endgame working).
    const opened = (game.opened ?? {})[uid] === true;
    const tentative = !opened && game.drawCount > 0;

    tx.update(handRef, { tiles: newHand });
    tx.update(gameRef, {
      [`discards.${leftSeat}`]: pile.slice(0, -1),
      [`handCounts.${uid}`]: newHand.length,
      [`handValue.${uid}`]:
        (game.handValue?.[uid] ?? 0) + tileValue(taken.face, game.okey),
      turnPhase: 'discard',
      ...(tentative
        ? { pendingTake: { uid, tile: taken, fromSeat: leftSeat } }
        : {}),
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
 * Returns a tentatively-taken left-discard tile to its pile when the player
 * couldn't open with it. Reverts to the draw phase so they draw from the deck.
 */
export async function returnTake(lobbyId: string, uid: string): Promise<void> {
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
    const pending = game.pendingTake;
    if (!pending || pending.uid !== uid) {
      throw new GameActionError('no-pending-take');
    }

    const handTiles = (handSnap.data() as PlayerHand).tiles;
    const index = handTiles.findIndex((t) => t.id === pending.tile.id);
    if (index < 0) throw new GameActionError('tile-not-in-hand');
    const newHand = [
      ...handTiles.slice(0, index),
      ...handTiles.slice(index + 1),
    ];

    const pile = game.discards[pending.fromSeat] ?? [];

    tx.update(handRef, { tiles: newHand });
    tx.update(gameRef, {
      [`discards.${pending.fromSeat}`]: [...pile, pending.tile],
      [`handCounts.${uid}`]: newHand.length,
      [`handValue.${uid}`]:
        (game.handValue?.[uid] ?? 0) - tileValue(pending.tile.face, game.okey),
      turnPhase: 'draw',
      pendingTake: deleteField(),
    });
    tx.set(doc(collection(gameRef, 'moves')), {
      type: 'return',
      by: uid,
      at: serverTimestamp(),
      tile: pending.tile.face,
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
    // A tentatively-taken left tile must be opened or returned first.
    if (game.pendingTake?.uid === uid) {
      throw new GameActionError('must-resolve-take');
    }

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

    // Held value after this discard (used to score the round if it ends here).
    const myNewValue =
      (game.handValue?.[uid] ?? 0) - tileValue(tile.face, game.okey);
    const postValue: Record<string, number> = {
      ...(game.handValue ?? {}),
      [uid]: myNewValue,
    };

    // Finishing (el bitirme): discarding the last tile after having opened wins.
    const won = newHand.length === 0 && (game.opened ?? {})[uid] === true;
    // Otherwise, if the deck is exhausted, this discard ends the hand (no winner).
    const deckExhausted = game.drawCount === 0;

    // When the round ends, score it and fold the result into the match totals.
    let endUpdate: Record<
      string,
      string | number | RoundResult | Record<string, number>
    > = {
      turnIndex: nextTurn,
      turnPhase: 'draw',
    };
    if (won || deckExhausted) {
      // A special finish (closing on the okey, or finishing a pairs hand)
      // doubles EVERY player. (A pair opener's own score also doubles — handled
      // per-player inside scoreRound via openedWith.)
      const globalDouble =
        won &&
        ((game.openedWith ?? {})[uid] === 'pair' ||
          isOkeyTile(tile.face, game.okey));
      const delta = scoreRound({
        playerOrder: game.playerOrder,
        opened: game.opened ?? {},
        openedWith: game.openedWith ?? {},
        handValue: postValue,
        globalDouble,
        ...(won ? { winner: uid } : {}),
      });
      const totals: Record<string, number> = {};
      for (const player of game.playerOrder) {
        totals[player] = (game.scores?.[player] ?? 0) + (delta[player] ?? 0);
      }
      const roundResult: RoundResult = {
        delta,
        totals,
        reason: won ? 'finish' : 'deck',
        doubled: globalDouble,
        ...(won ? { winner: uid } : {}),
      };
      endUpdate = {
        status: 'finished',
        scores: totals,
        roundsPlayed: (game.roundsPlayed ?? 0) + 1,
        roundResult,
        ...(won ? { winner: uid } : {}),
      };
    }

    tx.update(handRef, { tiles: newHand });
    tx.update(gameRef, {
      [`discards.${seat}`]: [...pile, tile],
      [`handCounts.${uid}`]: newHand.length,
      [`handValue.${uid}`]: myNewValue,
      ...endUpdate,
    });
    tx.set(doc(collection(gameRef, 'moves')), {
      type: 'discard',
      by: uid,
      at: serverTimestamp(),
      tile: tile.face,
    });
  });
}

/**
 * Starts the next round (el) of the match: re-deals from a fresh shuffle, resets
 * the table (melds, opens, discards, hands, deck, indicator), and rotates to a
 * new starter — while PRESERVING the cumulative match scores and roundsPlayed.
 * Called by the host from the between-rounds scoreboard.
 */
export async function advanceRound(lobbyId: string): Promise<void> {
  const gameRef = doc(db, GAMES_COLLECTION, lobbyId);
  const snapshot = await getDoc(gameRef);
  if (!snapshot.exists()) return;
  const game = snapshot.data() as GameState;
  const playerOrder = game.playerOrder;

  const result = deal();
  const okey = computeOkey(result.indicator.face);

  const handCounts: Record<string, number> = {};
  const handValue: Record<string, number> = {};
  playerOrder.forEach((uid, seat) => {
    handCounts[uid] = result.hands[seat]?.length ?? 0;
    handValue[uid] = handValueOf(result.hands[seat] ?? [], okey);
  });
  const discards: Record<string, Tile[]> = {};
  for (let seat = 0; seat < playerOrder.length; seat++) {
    discards[String(seat)] = [];
  }

  const batch = writeBatch(db);
  batch.update(gameRef, {
    status: 'playing',
    starterIndex: result.starterIndex,
    turnIndex: result.starterIndex,
    turnPhase: 'discard',
    indicator: result.indicator.face,
    okey,
    drawCount: result.drawPile.length,
    discards,
    handCounts,
    handValue,
    opened: {},
    openedWith: {},
    melds: [],
    roundResult: deleteField(),
    winner: deleteField(),
    pendingTake: deleteField(),
  });
  result.hands.forEach((hand, seat) => {
    batch.set(doc(gameRef, 'hands', playerOrder[seat]), { tiles: hand });
  });
  batch.set(doc(gameRef, 'private', 'deck'), { tiles: result.drawPile });
  await batch.commit();
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
