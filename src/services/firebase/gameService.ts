import {
  collection,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './config';
import { deal } from '@/game/deal';
import { computeOkey, countOkeys, isOkeyTile } from '@/game/okey';
import { classifyMeld, isPair } from '@/game/melds';
import { effectiveOpenMin, effectivePairMin } from '@/game/katlama';
import { orderMeld } from '@/game/arrange';
import {
  finishBonusOf,
  finishFlagsOf,
  handValueOf,
  NO_FINISH,
  opponentMultiplierOf,
  PENALTY_DISCARD_OKEY,
  PENALTY_DISCARD_PROCESSABLE,
  PENALTY_HELD_OKEY,
  PENALTY_WRONG_OPEN,
  PENALTY_WRONG_PROCESS,
  REKOR_BONUS,
  REKOR_MIN_PAIRS,
  REKOR_MIN_TOTAL,
  scoreRound,
  setMajority,
  setWinnerOf,
  tileValue,
} from '@/game/scoring';
import { emptierTeam, seatOrderForGame, teamOf } from '@/constants/lobby';
import {
  GameMode,
  LobbyStatus,
  type Lobby,
  type LobbyPlayer,
} from '@/types/lobby';
import type {
  GameState,
  PenaltyEntry,
  PenaltyReason,
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
  const okeyCount: Record<string, number> = {};
  const scores: Record<string, number> = {};
  playerOrder.forEach((uid, seat) => {
    handCounts[uid] = result.hands[seat]?.length ?? 0;
    handValue[uid] = handValueOf(result.hands[seat] ?? [], okey);
    okeyCount[uid] = countOkeys(result.hands[seat] ?? [], okey);
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
    okeyCount,
    scores,
    roundsPlayed: 0,
    roundsPerSet: lobby.settings.matchFormat.roundsPerSet,
    bestOf: lobby.settings.matchFormat.bestOf,
    setIndex: 0,
    setsWon: {},
    opened: {},
    openedWith: {},
    melds: [],
    doubling: lobby.settings.gameRules.doubling,
    floorPenalty: lobby.settings.gameRules.floorPenalty,
    rekorPenalty: lobby.settings.gameRules.rekorPenalty,
    assisted: lobby.settings.assisted ?? true,
    ...(paired ? { teams } : {}),
  };

  const batch = writeBatch(db);
  const gameRef = doc(db, GAMES_COLLECTION, lobby.id);

  batch.set(gameRef, {
    ...gameState,
    createdAt: serverTimestamp(),
    turnStartedAt: serverTimestamp(),
  });

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
  const okeyCount: Record<string, number> = {};
  const scores: Record<string, number> = {};
  playerOrder.forEach((uid, seat) => {
    handCounts[uid] = result.hands[seat]?.length ?? 0;
    handValue[uid] = handValueOf(result.hands[seat] ?? [], okey);
    okeyCount[uid] = countOkeys(result.hands[seat] ?? [], okey);
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
    okeyCount,
    scores,
    roundsPlayed: 0,
    roundsPerSet: lobby.settings.matchFormat.roundsPerSet,
    bestOf: lobby.settings.matchFormat.bestOf,
    setIndex: 0,
    setsWon: {},
    opened: {},
    openedWith: {},
    melds: [],
    doubling: lobby.settings.gameRules.doubling,
    floorPenalty: lobby.settings.gameRules.floorPenalty,
    rekorPenalty: lobby.settings.gameRules.rekorPenalty,
    assisted: lobby.settings.assisted ?? true,
    ...(paired ? { teams } : {}),
  };

  const batch = writeBatch(db);
  const gameRef = doc(db, GAMES_COLLECTION, lobby.id);
  batch.set(gameRef, {
    ...gameState,
    createdAt: serverTimestamp(),
    turnStartedAt: serverTimestamp(),
  });
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
 * Builds the Firestore update that records the take-to-open floor penalty: when
 * a not-yet-opened player commits a left-taken tile by OPENING with it, the
 * discarder (the left neighbour who threw it) owes `tileValue × multiplier`
 * (×10 series, ×20 pairs). Returns `{}` when penalties are off, there is no
 * committed take, or the discarder can't be resolved.
 */
function takeOpenPenaltyUpdate(
  game: GameState,
  uid: string,
  reason: PenaltyReason,
  multiplier: number,
): Record<string, PenaltyEntry[]> {
  const committed = game.pendingTake?.uid === uid;
  if (!committed || !game.floorPenalty || !game.pendingTake) return {};
  const discarder = game.playerOrder[Number(game.pendingTake.fromSeat)];
  const points = tileValue(game.pendingTake.tile.face, game.okey) * multiplier;
  if (!discarder || points <= 0) return {};
  const entry: PenaltyEntry = {
    uid: discarder,
    reason,
    points,
    tile: game.pendingTake.tile.face,
  };
  return { penaltyLog: [...(game.penaltyLog ?? []), entry] };
}

/**
 * Whether an invalid open/process should be turned into a "rejected but
 * penalized" move instead of a hard block. Only in unassisted (desteksiz) games
 * with floor penalties on: there the player gets no helpers, so an invalid
 * declaration is their mistake to own. Assisted games (or games without floor
 * penalties) keep blocking with no penalty.
 */
function penalizesInvalidMoves(game: GameState): boolean {
  return game.assisted === false && game.floorPenalty === true;
}

/** Appends a wrong-move penalty to the round log, written to the actor (`uid`). */
function wrongMovePenaltyLog(
  game: GameState,
  uid: string,
  reason: 'wrong-open' | 'wrong-process',
  points: number,
): PenaltyEntry[] {
  return [...(game.penaltyLog ?? []), { uid, reason, points }];
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

  const outcome = await runTransaction(db, async (tx) => {
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
    let invalidMeld = false;
    for (const [index, group] of groups.entries()) {
      const info = classifyMeld(
        group.map((tile) => tile.face),
        game.okey,
      );
      if (!info) {
        invalidMeld = true;
        break;
      }
      total += info.value;
      tableMelds.push({
        id: `${uid}-${existingMelds.length + index}`,
        owner: uid,
        kind: info.kind,
        tiles: orderMeld(group, game.okey),
      });
    }
    // The opening threshold only applies to the FIRST opening. Under katlama it
    // rises above the opponents' highest opening (effectiveOpenMin).
    const belowThreshold =
      !alreadyOpened && total < effectiveOpenMin(game, uid);
    if (invalidMeld || belowThreshold) {
      // Unassisted: don't lay the melds — reject the open but commit a wrong-open
      // penalty here, then signal the caller to surface a "ceza" toast.
      if (penalizesInvalidMoves(game)) {
        tx.update(gameRef, {
          penaltyLog: wrongMovePenaltyLog(game, uid, 'wrong-open', PENALTY_WRONG_OPEN),
        });
        return 'wrong-open' as const;
      }
      throw new GameActionError(invalidMeld ? 'invalid-meld' : 'below-threshold');
    }

    const openedIds = new Set(groups.flat().map((tile) => tile.id));
    const handTiles = (handSnap.data() as PlayerHand).tiles;
    const remaining = handTiles.filter((tile) => !openedIds.has(tile.id));
    if (handTiles.length - remaining.length !== openedIds.size) {
      throw new GameActionError('tile-not-in-hand');
    }
    if (remaining.length < 1) throw new GameActionError('must-keep-tile');

    const laidValue = handValueOf(groups.flat(), game.okey);
    // Opening commits any tentatively-taken left tile; doing so on a FIRST open
    // writes a floor penalty to the discarder (pendingTake is never set for an
    // already-opened player, so this only ever fires on the first open).
    const committedTake = game.pendingTake?.uid === uid;
    const penaltyUpdate = takeOpenPenaltyUpdate(
      game,
      uid,
      'take-open-series',
      10,
    );
    // Rekor: a FIRST open whose meld total reaches 153+ (later melds don't count
    // toward this). Recorded now, rewarded at round end only if this player wins.
    const isRekor =
      !alreadyOpened && game.rekorPenalty === true && total >= REKOR_MIN_TOTAL;
    tx.update(handRef, { tiles: remaining });
    tx.update(gameRef, {
      melds: [...existingMelds, ...tableMelds],
      [`opened.${uid}`]: true,
      // Record the opening kind + value only on the FIRST open (the katlama bar).
      // `openedThisTurn` also starts the elden-bitme window here; a second open
      // in the same turn takes this branch no more, so the window survives it.
      ...(alreadyOpened
        ? {}
        : {
            [`openedWith.${uid}`]: 'meld',
            [`openValue.${uid}`]: total,
            openedThisTurn: uid,
          }),
      [`handCounts.${uid}`]: remaining.length,
      [`handValue.${uid}`]: (game.handValue?.[uid] ?? 0) - laidValue,
      [`okeyCount.${uid}`]: countOkeys(remaining, game.okey),
      ...(committedTake ? { pendingTake: deleteField() } : {}),
      ...(isRekor ? { [`rekor.${uid}`]: true } : {}),
      ...penaltyUpdate,
    });
    tx.set(doc(collection(gameRef, 'moves')), {
      type: 'open',
      by: uid,
      at: serverTimestamp(),
      total,
    });
    return undefined;
  });
  // Penalty already committed above; throw afterwards only to drive the UI toast.
  if (outcome === 'wrong-open') throw new GameActionError('wrong-open');
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

  const outcome = await runTransaction(db, async (tx) => {
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

    const alreadyOpened = (game.opened ?? {})[uid] === true;
    const existingMelds = game.melds ?? [];
    const pairsAreaExists = existingMelds.some((meld) => meld.kind === 'pair');

    // A meld opener may only add pairs once a pairs area exists (structural rule,
    // always blocked — not a "wrong open" the player can be penalized into).
    if (
      alreadyOpened &&
      (game.openedWith ?? {})[uid] !== 'pair' &&
      !pairsAreaExists
    ) {
      throw new GameActionError('no-pairs-area');
    }

    const invalidPair = groups.some(
      (group) => !isPair(group.map((tile) => tile.face), game.okey),
    );
    // Opening with pairs requires reaching the pairs threshold; under katlama it
    // rises above the opponents' highest pairs opening (effectivePairMin).
    const belowThreshold =
      !alreadyOpened && groups.length < effectivePairMin(game, uid);
    if (invalidPair || belowThreshold) {
      // Unassisted: reject the lay but commit a wrong-open penalty here.
      if (penalizesInvalidMoves(game)) {
        tx.update(gameRef, {
          penaltyLog: wrongMovePenaltyLog(game, uid, 'wrong-open', PENALTY_WRONG_OPEN),
        });
        return 'wrong-open' as const;
      }
      throw new GameActionError(
        invalidPair ? 'invalid-pair' : 'pairs-below-threshold',
      );
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
    // Opening with pairs commits any tentatively-taken left tile; on a FIRST
    // open this writes a ×20 floor penalty to the discarder.
    const committedTake = game.pendingTake?.uid === uid;
    const penaltyUpdate = takeOpenPenaltyUpdate(game, uid, 'take-open-pair', 20);
    // Rekor: opening with 7+ pairs in one go. Rewarded at round end only if this
    // player also finishes the round.
    const isRekor =
      !alreadyOpened &&
      game.rekorPenalty === true &&
      groups.length >= REKOR_MIN_PAIRS;
    tx.update(handRef, { tiles: remaining });
    tx.update(gameRef, {
      melds: [...existingMelds, ...pairMelds],
      [`opened.${uid}`]: true,
      // Record 'pair' + the pair count only when this is the player's first open.
      // `openedThisTurn` opens the elden-bitme window (see `openMelds`).
      ...(alreadyOpened
        ? {}
        : {
            [`openedWith.${uid}`]: 'pair',
            [`openValue.${uid}`]: groups.length,
            openedThisTurn: uid,
          }),
      [`handCounts.${uid}`]: remaining.length,
      [`handValue.${uid}`]: (game.handValue?.[uid] ?? 0) - laidValue,
      [`okeyCount.${uid}`]: countOkeys(remaining, game.okey),
      ...(committedTake ? { pendingTake: deleteField() } : {}),
      ...(isRekor ? { [`rekor.${uid}`]: true } : {}),
      ...penaltyUpdate,
    });
    tx.set(doc(collection(gameRef, 'moves')), {
      type: 'open',
      by: uid,
      at: serverTimestamp(),
      pairs: groups.length,
    });
    return undefined;
  });
  // Penalty already committed above; throw afterwards only to drive the UI toast.
  if (outcome === 'wrong-open') throw new GameActionError('wrong-open');
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

  const outcome = await runTransaction(db, async (tx) => {
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
    if (!info) {
      // Unassisted: reject the process but commit a wrong-process penalty here.
      if (penalizesInvalidMoves(game)) {
        tx.update(gameRef, {
          penaltyLog: wrongMovePenaltyLog(
            game,
            uid,
            'wrong-process',
            PENALTY_WRONG_PROCESS,
          ),
        });
        return 'wrong-process' as const;
      }
      throw new GameActionError('invalid-meld');
    }

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
      [`okeyCount.${uid}`]: countOkeys(remaining, game.okey),
      // Processing forfeits elden bitme ("taş işlemeden bitmek"). Only on the
      // success path — a rejected wrong-process moved no tile, so it doesn't.
      openedThisTurn: deleteField(),
    });
    tx.set(doc(collection(gameRef, 'moves')), {
      type: 'process',
      by: uid,
      at: serverTimestamp(),
      meldId,
      tile: tile.face,
    });
    return undefined;
  });
  // Penalty already committed above; throw afterwards only to drive the UI toast.
  if (outcome === 'wrong-process') throw new GameActionError('wrong-process');
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
      // Unassisted-mode "rejected but penalized" signals: the penalty was already
      // committed inside the transaction; this is thrown afterwards only so the UI
      // can surface a "ceza yazıldı" toast (it does NOT roll back the penalty).
      | 'wrong-open'
      | 'wrong-process'
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
      [`okeyCount.${uid}`]: countOkeys(newHand, game.okey),
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
      [`okeyCount.${uid}`]: countOkeys(newHand, game.okey),
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
      [`okeyCount.${uid}`]: countOkeys(newHand, game.okey),
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
 *
 * `skipFloorPenalty` suppresses the discard-triggered floor penalties (okeyle
 * atma / işlek taş atma). Only the turn-timeout auto-play sets it: the player
 * didn't choose that tile, so charging them for it would be a time penalty in
 * disguise. Round-end penalties (held okey) are unaffected.
 */
export async function discardTile(
  lobbyId: string,
  uid: string,
  tileId: string,
  { skipFloorPenalty = false }: { skipFloorPenalty?: boolean } = {},
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
    const discardedOkey = isOkeyTile(tile.face, game.okey);

    // Floor penalties triggered BY this discard (cezalar). Both are public — the
    // discarded tile is visible — so no private-hand read is needed. Skipped on a
    // winning discard (you finished; closing on the okey multiplies the
    // opponents, it isn't a penalty).
    const newPenalties: PenaltyEntry[] = [];
    if (game.floorPenalty && !won && !skipFloorPenalty) {
      // Okeyle atma: discarding the okey tile.
      if (discardedOkey) {
        newPenalties.push({
          uid,
          reason: 'discard-okey',
          points: PENALTY_DISCARD_OKEY,
          tile: tile.face,
        });
      }
      // İşlek taş atma: the discard fits (could be işle'd onto) an open meld.
      const openMeldsOnTable = (game.melds ?? []).filter(
        (meld) => meld.kind !== 'pair',
      );
      const isProcessable = openMeldsOnTable.some((meld) =>
        classifyMeld([...meld.tiles.map((t) => t.face), tile.face], game.okey),
      );
      if (isProcessable) {
        newPenalties.push({
          uid,
          reason: 'discard-processable',
          points: PENALTY_DISCARD_PROCESSABLE,
          tile: tile.face,
        });
      }
    }
    const fullLog = newPenalties.length
      ? [...(game.penaltyLog ?? []), ...newPenalties]
      : (game.penaltyLog ?? []);

    // When the round ends, score it and fold the result into the match totals.
    let endUpdate: Record<
      string,
      string | number | RoundResult | Record<string, number>
    > = {
      turnIndex: nextTurn,
      turnPhase: 'draw',
    };
    if (won || deckExhausted) {
      // What kind of finish this was. A special finish pays the finisher a flat
      // -200 and multiplies the OPPONENTS; the finisher is never multiplied.
      // (A pair opener's own ×2 commitment is applied per-player in scoreRound.)
      const finishFlags = won
        ? finishFlagsOf({
            uid,
            playerOrder: game.playerOrder,
            opened: game.opened ?? {},
            openedWith: game.openedWith ?? {},
            ...(game.openedThisTurn
              ? { openedThisTurn: game.openedThisTurn }
              : {}),
            okeyDiscard: discardedOkey,
          })
        : NO_FINISH;
      const finishBonus = finishBonusOf(finishFlags);
      const opponentMultiplier = won ? opponentMultiplierOf(finishFlags) : 1;
      const delta = scoreRound({
        playerOrder: game.playerOrder,
        opened: game.opened ?? {},
        openedWith: game.openedWith ?? {},
        handValue: postValue,
        finishBonus,
        opponentMultiplier,
        ...(won ? { winner: uid } : {}),
      });
      // Held-okey penalty: an OPENED player still holding the okey when the
      // round ends. Uses the public okeyCount (no private-hand read); the
      // discarder's post-discard count comes from their new hand.
      const heldOkeyPenalties: PenaltyEntry[] = [];
      if (game.floorPenalty) {
        const postOkeyCount: Record<string, number> = {
          ...(game.okeyCount ?? {}),
          [uid]: countOkeys(newHand, game.okey),
        };
        for (const player of game.playerOrder) {
          if (
            (game.opened ?? {})[player] === true &&
            (postOkeyCount[player] ?? 0) >= 1
          ) {
            heldOkeyPenalties.push({
              uid: player,
              reason: 'held-okey',
              points: PENALTY_HELD_OKEY,
            });
          }
        }
      }
      // Rekor reward: if the finisher made a rekor opening this round (7+ pairs
      // or a 153+ first open), they get an extra -101. Only when they finish.
      const rekorBonus: PenaltyEntry[] = [];
      if (won && (game.rekor ?? {})[uid] === true) {
        rekorBonus.push({ uid, reason: 'rekor', points: REKOR_BONUS });
      }
      // Fold this round's floor penalties (cezalar) and the rekor reward into the
      // round delta, including any incurred by this very discard / held-okey checks.
      const penaltyLog = [...fullLog, ...heldOkeyPenalties, ...rekorBonus];
      // Snapshot the hand-only score before penalties land, so the scoreboard
      // can show "elde kalan" and "ceza" separately without re-deriving either.
      const handDelta = { ...delta };
      for (const entry of penaltyLog) {
        delta[entry.uid] = (delta[entry.uid] ?? 0) + entry.points;
      }
      const totals: Record<string, number> = {};
      for (const player of game.playerOrder) {
        totals[player] = (game.scores?.[player] ?? 0) + (delta[player] ?? 0);
      }

      // Set / match progression. A set ends after `roundsPerSet` rounds; the
      // side with the lowest set total wins it. In paired mode "sides" are the
      // two teams (totals combined per team); in solo mode each player is a side.
      const teams = game.teams;
      const sides = teams ? ['0', '1'] : game.playerOrder;
      const setTotals: Record<string, number> = teams
        ? { '0': 0, '1': 0 }
        : totals;
      if (teams) {
        for (const player of game.playerOrder) {
          const side = String(teams[player] ?? 0);
          setTotals[side] = (setTotals[side] ?? 0) + (totals[player] ?? 0);
        }
      }

      const newRoundsPlayed = (game.roundsPlayed ?? 0) + 1;
      const setComplete = newRoundsPlayed >= (game.roundsPerSet ?? 1);
      let nextSetsWon = game.setsWon ?? {};
      let setWinner: string | undefined;
      let matchComplete = false;
      let matchWinner: string | undefined;
      if (setComplete) {
        setWinner = setWinnerOf(sides, setTotals);
        if (setWinner) {
          nextSetsWon = {
            ...nextSetsWon,
            [setWinner]: (nextSetsWon[setWinner] ?? 0) + 1,
          };
          if ((nextSetsWon[setWinner] ?? 0) >= setMajority(game.bestOf ?? 1)) {
            matchComplete = true;
            matchWinner = setWinner;
          }
        }
      }

      const roundResult: RoundResult = {
        delta,
        handDelta,
        totals,
        reason: won ? 'finish' : 'deck',
        doubled: opponentMultiplier > 1,
        ...(won
          ? {
              winner: uid,
              finish: {
                ...finishFlags,
                multiplier: opponentMultiplier,
                bonus: finishBonus,
              },
            }
          : {}),
        ...(setComplete
          ? { setComplete: true, ...(setWinner ? { setWinner } : {}) }
          : {}),
        ...(matchComplete
          ? { matchComplete: true, ...(matchWinner ? { matchWinner } : {}) }
          : {}),
        ...(penaltyLog.length ? { penalties: penaltyLog } : {}),
      };
      endUpdate = {
        status: 'finished',
        scores: totals,
        roundsPlayed: newRoundsPlayed,
        roundResult,
        ...(won ? { winner: uid } : {}),
        ...(setComplete ? { setsWon: nextSetsWon } : {}),
      };
    }

    tx.update(handRef, { tiles: newHand });
    tx.update(gameRef, {
      [`discards.${seat}`]: [...pile, tile],
      [`handCounts.${uid}`]: newHand.length,
      [`handValue.${uid}`]: myNewValue,
      [`okeyCount.${uid}`]: countOkeys(newHand, game.okey),
      // The discard ends the turn, so the elden-bitme window closes here — and
      // since this is the only place that advances `turnIndex`, the marker can
      // never survive into someone else's turn. Kept out of `endUpdate`, which
      // is typed without FieldValue and only merged when the round ends.
      openedThisTurn: deleteField(),
      ...(newPenalties.length ? { penaltyLog: fullLog } : {}),
      ...endUpdate,
      // Restart the turn clock only when the turn actually passes to a live next
      // player (not when the round ends — then the scoreboard modal shows).
      ...(won || deckExhausted ? {} : { turnStartedAt: serverTimestamp() }),
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
 * Picks the tile to auto-discard on a turn timeout. The user's chosen behavior is
 * "draw + discard the drawn tile" — the freshly-drawn tile is the LAST in the
 * hand — so the player's hand is left unchanged. If that tile would incur a
 * floor penalty (it's the okey, or it fits an open meld = işlek), prefer the
 * first tile that wouldn't — not for the penalty (the caller suppresses those
 * via `skipFloorPenalty`) but to avoid handing the table a free tile. Returns
 * the tile id, or null only for an empty hand.
 *
 * A single-tile hand IS discardable, and must be: an unopened player never gets
 * below 21 tiles, so one tile means they've opened and that discard is their
 * winning move. Refusing it would hang the round forever, since `discardTile`
 * is the only thing that advances the turn.
 */
function pickTimeoutDiscard(hand: Tile[], game: GameState): string | null {
  if (hand.length < 1) return null;
  const causesPenalty = (tile: Tile): boolean => {
    if (!game.floorPenalty) return false;
    if (isOkeyTile(tile.face, game.okey)) return true;
    return (game.melds ?? [])
      .filter((meld) => meld.kind !== 'pair')
      .some((meld) =>
        classifyMeld([...meld.tiles.map((t) => t.face), tile.face], game.okey),
      );
  };
  const drawn = hand[hand.length - 1];
  if (!causesPenalty(drawn)) return drawn.id;
  const safe = hand.find((tile) => !causesPenalty(tile));
  return (safe ?? drawn).id;
}

/**
 * Auto-resolves the current player's turn when their countdown expires: returns a
 * pending take, draws from the deck if needed, then discards (the drawn tile, or
 * a penalty-free fallback). NO time penalty is written. Reuses the normal
 * draw/discard/return transactions, so all scoring and round/set progression run
 * exactly as for a manual play.
 *
 * v1 is driven ONLY by the timed-out player's OWN client (so there is no
 * cross-client race). Letting OTHER clients fire it after a grace period — to
 * cover a disconnected player — is deferred to the separate disconnect task.
 */
export async function resolveTurnTimeout(
  lobbyId: string,
  uid: string,
): Promise<void> {
  const gameRef = doc(db, GAMES_COLLECTION, lobbyId);
  const handRef = doc(gameRef, 'hands', uid);

  const read = async (): Promise<GameState | null> => {
    const snap = await getDoc(gameRef);
    return snap.exists() ? (snap.data() as GameState) : null;
  };

  // Guard: only act while it's genuinely this player's live turn.
  const start = await read();
  if (!start || start.status !== 'playing' || start.roundResult) return;
  if (start.playerOrder[start.turnIndex] !== uid) return;

  // 1. Undo a tentatively-taken left tile (the timed-out player didn't open).
  if (start.pendingTake?.uid === uid) {
    await returnTake(lobbyId, uid).catch(() => {});
  }

  // 2. Make sure a tile has been drawn. If the deck is empty the round is ending
  //    by exhaustion — leave it to the normal flow.
  const afterTake = await read();
  if (!afterTake || afterTake.playerOrder[afterTake.turnIndex] !== uid) return;
  if (afterTake.turnPhase === 'draw') {
    if ((afterTake.drawCount ?? 0) === 0) return;
    // A concurrent driver (when this player is offline) may have drawn first —
    // its guards throw; bail rather than double-act.
    try {
      await drawFromDeck(lobbyId, uid);
    } catch {
      return;
    }
  }

  // 3. Discard. Re-read so the chosen tile reflects the just-drawn hand.
  const afterDraw = await read();
  if (
    !afterDraw ||
    afterDraw.status !== 'playing' ||
    afterDraw.playerOrder[afterDraw.turnIndex] !== uid ||
    afterDraw.turnPhase !== 'discard'
  ) {
    return;
  }
  const handSnap = await getDoc(handRef);
  if (!handSnap.exists()) return;
  const tileId = pickTimeoutDiscard(
    (handSnap.data() as PlayerHand).tiles,
    afterDraw,
  );
  // Swallow the guard errors a losing concurrent driver hits (tile already gone /
  // turn already advanced) — only one discard actually lands.
  if (tileId) {
    await discardTile(lobbyId, uid, tileId, {
      skipFloorPenalty: true,
    }).catch(() => {});
  }
}

/* -------------------------------------------------------------------------- */
/*  Presence (heartbeat). Stored at games/{id}/private/presence so it does NOT  */
/*  churn the main game-doc snapshot. Each client stamps its own uid every few  */
/*  seconds; a stale stamp means that player is offline (disconnected).         */
/* -------------------------------------------------------------------------- */

/** Stamps the current player's heartbeat (called on a timer while in-game). */
export async function writePresence(
  lobbyId: string,
  uid: string,
): Promise<void> {
  const ref = doc(db, GAMES_COLLECTION, lobbyId, 'private', 'presence');
  await setDoc(ref, { [uid]: serverTimestamp() }, { merge: true });
}

/** Subscribes to the presence map (uid → last-seen Timestamp). */
export function subscribeToPresence(
  lobbyId: string,
  onChange: (lastSeen: Record<string, Timestamp>) => void,
): Unsubscribe {
  const ref = doc(db, GAMES_COLLECTION, lobbyId, 'private', 'presence');
  return onSnapshot(ref, (snap) => {
    onChange(
      snap.exists() ? (snap.data() as Record<string, Timestamp>) : {},
    );
  });
}

/**
 * Re-deals a fresh hand from a new shuffle and clears the table (melds, opens,
 * discards, hands, deck, indicator, pendingTake), rotating to a new starter.
 * `extra` carries the round-vs-set difference (a set also resets scores and the
 * in-set round counter). Shared by `advanceRound` and `advanceSet`.
 */
async function redealAndUpdate(
  lobbyId: string,
  extra: Record<string, number | Record<string, number>>,
): Promise<void> {
  const gameRef = doc(db, GAMES_COLLECTION, lobbyId);
  const snapshot = await getDoc(gameRef);
  if (!snapshot.exists()) return;
  const game = snapshot.data() as GameState;
  const playerOrder = game.playerOrder;

  const result = deal();
  const okey = computeOkey(result.indicator.face);

  const handCounts: Record<string, number> = {};
  const handValue: Record<string, number> = {};
  const okeyCount: Record<string, number> = {};
  playerOrder.forEach((uid, seat) => {
    handCounts[uid] = result.hands[seat]?.length ?? 0;
    handValue[uid] = handValueOf(result.hands[seat] ?? [], okey);
    okeyCount[uid] = countOkeys(result.hands[seat] ?? [], okey);
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
    turnStartedAt: serverTimestamp(),
    indicator: result.indicator.face,
    okey,
    drawCount: result.drawPile.length,
    discards,
    handCounts,
    handValue,
    okeyCount,
    opened: {},
    openedWith: {},
    openValue: {},
    openedThisTurn: deleteField(),
    melds: [],
    roundResult: deleteField(),
    winner: deleteField(),
    pendingTake: deleteField(),
    penaltyLog: deleteField(),
    rekor: deleteField(),
    ...extra,
  });
  result.hands.forEach((hand, seat) => {
    batch.set(doc(gameRef, 'hands', playerOrder[seat]), { tiles: hand });
  });
  batch.set(doc(gameRef, 'private', 'deck'), { tiles: result.drawPile });
  await batch.commit();
}

/**
 * Starts the next round (el) within the current set: re-deals while PRESERVING
 * the set's running scores, the in-set round counter, and sets won so far.
 * Called by the host from the between-rounds scoreboard.
 */
export async function advanceRound(lobbyId: string): Promise<void> {
  await redealAndUpdate(lobbyId, {});
}

/**
 * Starts the next SET of the match: re-deals and resets the set's scores and
 * in-set round counter to zero, advancing the set index. Sets won so far are
 * preserved (they were updated when the set completed). Host-triggered.
 */
export async function advanceSet(lobbyId: string): Promise<void> {
  const gameRef = doc(db, GAMES_COLLECTION, lobbyId);
  const snapshot = await getDoc(gameRef);
  if (!snapshot.exists()) return;
  const game = snapshot.data() as GameState;
  const scores: Record<string, number> = {};
  game.playerOrder.forEach((uid) => (scores[uid] = 0));
  await redealAndUpdate(lobbyId, {
    scores,
    roundsPlayed: 0,
    setIndex: (game.setIndex ?? 0) + 1,
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
