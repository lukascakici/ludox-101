/**
 * Dev-only cheats to make testing game flows easy without waiting for the right
 * tiles to be dealt. These write directly to the game/hand docs (allowed by the
 * Firestore rules for an authenticated player on their own hand). They are
 * imported only behind `import.meta.env.DEV` guards in the UI.
 *
 * NOT for production — they bypass normal turn/validation logic on purpose.
 */
import {
  deleteField,
  doc,
  getDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from './config';
import { classifyMeld } from '@/game/melds';
import { deal } from '@/game/deal';
import { computeOkey } from '@/game/okey';
import { handValueOf, tileValue } from '@/game/scoring';
import {
  buildTileSet,
  shuffle,
  TILE_COLORS,
  type Tile,
  type TileColor,
  type TileFace,
} from '@/game/tiles';
import type { GameState, PlayerHand, TableMeld } from '@/types/game';

const GAMES_COLLECTION = 'games';

/** Preset hands the dev panel can load. */
export type DevHandKind = 'pairs' | 'meld101' | 'finish' | 'rekor';

let devSeq = 0;
function devTile(face: TileFace, uid: string): Tile {
  return { id: `dev-${uid}-${devSeq++}`, face };
}
function num(color: TileColor, value: number): TileFace {
  return { kind: 'number', color, value };
}

/** 6 red pairs (1–6) + 9 distinct fillers = 21 tiles. Ready for çift açma. */
function buildPairsHand(uid: string): Tile[] {
  const tiles: Tile[] = [];
  for (let value = 1; value <= 6; value++) {
    tiles.push(devTile(num('red', value), uid));
    tiles.push(devTile(num('red', value), uid));
  }
  const fillers: [TileColor, number][] = [
    ['yellow', 1],
    ['yellow', 3],
    ['yellow', 5],
    ['yellow', 7],
    ['blue', 2],
    ['blue', 4],
    ['blue', 6],
    ['black', 8],
    ['black', 10],
  ];
  for (const [color, value] of fillers) tiles.push(devTile(num(color, value), uid));
  return tiles;
}

/** Three groups (13s, 12s, 11s) totalling 133 + 10 fillers = 21. Ready for 101. */
function buildMeld101Hand(uid: string): Tile[] {
  const tiles: Tile[] = [];
  for (const color of TILE_COLORS) tiles.push(devTile(num(color, 13), uid)); // 52
  for (const color of TILE_COLORS) tiles.push(devTile(num(color, 12), uid)); // 48
  for (const color of ['red', 'yellow', 'blue'] as TileColor[]) {
    tiles.push(devTile(num(color, 11), uid)); // 33
  }
  const fillers: [TileColor, number][] = [
    ['red', 1],
    ['yellow', 2],
    ['blue', 3],
    ['black', 4],
    ['red', 6],
    ['yellow', 8],
    ['blue', 9],
    ['black', 1],
    ['red', 3],
    ['yellow', 5],
  ];
  for (const [color, value] of fillers) tiles.push(devTile(num(color, value), uid));
  return tiles;
}

/** 7 red pairs (1–7) + 7 distinct fillers = 21 tiles. Triggers the rekor case. */
function buildRekorHand(uid: string): Tile[] {
  const tiles: Tile[] = [];
  for (let value = 1; value <= 7; value++) {
    tiles.push(devTile(num('red', value), uid));
    tiles.push(devTile(num('red', value), uid));
  }
  const fillers: [TileColor, number][] = [
    ['yellow', 1],
    ['yellow', 3],
    ['yellow', 5],
    ['blue', 2],
    ['blue', 4],
    ['blue', 6],
    ['black', 8],
  ];
  for (const [color, value] of fillers) tiles.push(devTile(num(color, value), uid));
  return tiles;
}

/** A single tile — discard it (while opened) to win and test el bitirme. */
function buildFinishHand(uid: string): Tile[] {
  return [devTile(num('red', 5), uid)];
}

function buildHand(kind: DevHandKind, uid: string): Tile[] {
  switch (kind) {
    case 'pairs':
      return buildPairsHand(uid);
    case 'meld101':
      return buildMeld101Hand(uid);
    case 'rekor':
      return buildRekorHand(uid);
    case 'finish':
      return buildFinishHand(uid);
  }
}

async function loadGame(lobbyId: string): Promise<GameState | null> {
  const snap = await getDoc(doc(db, GAMES_COLLECTION, lobbyId));
  return snap.exists() ? (snap.data() as GameState) : null;
}

/** Makes it your turn in the discard phase, so you can act without waiting. */
export async function devSetMyTurn(lobbyId: string, uid: string): Promise<void> {
  const game = await loadGame(lobbyId);
  if (!game) return;
  const seat = game.playerOrder.indexOf(uid);
  if (seat < 0) return;
  await updateDoc(doc(db, GAMES_COLLECTION, lobbyId), {
    turnIndex: seat,
    turnPhase: 'discard',
  });
}

/**
 * Marks you as already opened, to test işleme directly. The kind matters:
 * a 'pair' opener may NOT lay new melds (only işle onto existing ones), a 'meld'
 * opener may lay melds. (The old single 'Beni aç' always marked 'meld', which is
 * why a "pair opener" could still lay a per while testing.)
 */
export async function devMarkOpened(
  lobbyId: string,
  uid: string,
  kind: 'meld' | 'pair' = 'meld',
): Promise<void> {
  await updateDoc(doc(db, GAMES_COLLECTION, lobbyId), {
    [`opened.${uid}`]: true,
    [`openedWith.${uid}`]: kind,
  });
}

/**
 * Replaces your hand with a preset scenario hand and jumps the turn to you in
 * the discard phase. The 'finish' preset also marks you opened so discarding the
 * single tile wins.
 */
export async function devGiveHand(
  lobbyId: string,
  uid: string,
  kind: DevHandKind,
): Promise<void> {
  const game = await loadGame(lobbyId);
  if (!game) return;
  const seat = game.playerOrder.indexOf(uid);
  if (seat < 0) return;

  const tiles = buildHand(kind, uid);
  const gameRef = doc(db, GAMES_COLLECTION, lobbyId);
  const handRef = doc(gameRef, 'hands', uid);

  await updateDoc(handRef, { tiles });
  await updateDoc(gameRef, {
    [`handCounts.${uid}`]: tiles.length,
    [`handValue.${uid}`]: handValueOf(tiles, game.okey),
    turnIndex: seat,
    turnPhase: 'discard',
    ...(kind === 'finish'
      ? { [`opened.${uid}`]: true, [`openedWith.${uid}`]: 'meld' }
      : {}),
  });
}

/**
 * Stages the take-to-open floor penalty test: gives you a ≥101 openable hand
 * PLUS a pending left-take (as if you'd just taken your left neighbour's
 * discard), with penalties forced on. Then a single "Aç" commits the take and
 * writes the ×10 penalty to that left neighbour. (Use "Çift Koy" instead to test
 * the ×20 pairs variant — replace the staged hand with a pairs hand first.)
 */
export async function devSetupTakeOpen(
  lobbyId: string,
  uid: string,
): Promise<void> {
  const game = await loadGame(lobbyId);
  if (!game) return;
  const count = game.playerOrder.length;
  const seat = game.playerOrder.indexOf(uid);
  if (seat < 0) return;
  const leftSeat = (seat - 1 + count) % count;

  // An openable 101 hand plus a "taken" tile sitting on the rack on loan.
  const taken = devTile(num('red', 9), uid);
  const tiles = [...buildMeld101Hand(uid), taken];

  const gameRef = doc(db, GAMES_COLLECTION, lobbyId);
  const handRef = doc(gameRef, 'hands', uid);
  await updateDoc(handRef, { tiles });
  await updateDoc(gameRef, {
    [`handCounts.${uid}`]: tiles.length,
    [`handValue.${uid}`]: handValueOf(tiles, game.okey),
    turnIndex: seat,
    turnPhase: 'discard',
    // Not opened yet (penalty only fires on the first open).
    [`opened.${uid}`]: deleteField(),
    [`openedWith.${uid}`]: deleteField(),
    floorPenalty: true,
    pendingTake: { uid, tile: taken, fromSeat: String(leftSeat) },
  });
}

/**
 * Adds a tile to your hand that can be işle'd onto some existing table meld (to
 * test the marker + auto-işle). Falls back to a generic tile if no meld fits.
 */
export async function devAddProcessableTile(
  lobbyId: string,
  uid: string,
): Promise<void> {
  const game = await loadGame(lobbyId);
  if (!game) return;
  const gameRef = doc(db, GAMES_COLLECTION, lobbyId);
  const handRef = doc(gameRef, 'hands', uid);
  const handSnap = await getDoc(handRef);
  if (!handSnap.exists()) return;

  const melds = (game.melds ?? []).filter((meld) => meld.kind !== 'pair');
  let face: TileFace = num('red', 7);
  outer: for (const meld of melds) {
    for (const color of TILE_COLORS) {
      for (let value = 1; value <= 13; value++) {
        const candidate = num(color, value);
        if (
          classifyMeld([...meld.tiles.map((t) => t.face), candidate], game.okey)
        ) {
          face = candidate;
          break outer;
        }
      }
    }
  }

  const tiles = [...(handSnap.data() as PlayerHand).tiles, devTile(face, uid)];
  await updateDoc(handRef, { tiles });
  await updateDoc(gameRef, {
    [`handCounts.${uid}`]: tiles.length,
    [`handValue.${uid}`]:
      (game.handValue?.[uid] ?? 0) + tileValue(face, game.okey),
  });
}

/**
 * Re-deals the whole round from a fresh shuffle: new hands for everyone, new
 * indicator/okey/deck, and clears the table (melds, opens, discards). The same
 * players keep their seats. Use to start a clean test without leaving the game.
 */
export async function devRedeal(lobbyId: string): Promise<void> {
  const game = await loadGame(lobbyId);
  if (!game) return;
  const playerOrder = game.playerOrder;
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

  const gameRef = doc(db, GAMES_COLLECTION, lobbyId);
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
    // Dev re-deal starts a fresh match: clear scores, set/round progress too.
    scores,
    roundsPlayed: 0,
    setIndex: 0,
    setsWon: {},
    opened: {},
    openedWith: {},
    melds: [],
    roundResult: deleteField(),
    winner: deleteField(),
    pendingTake: deleteField(),
    penaltyLog: deleteField(),
  });
  result.hands.forEach((hand, seat) => {
    batch.set(doc(gameRef, 'hands', playerOrder[seat]), { tiles: hand });
  });
  batch.set(doc(gameRef, 'private', 'deck'), { tiles: result.drawPile });
  await batch.commit();
}

/** Replaces only your hand with a fresh random 21 tiles and jumps the turn to you. */
export async function devRandomHand(
  lobbyId: string,
  uid: string,
): Promise<void> {
  const game = await loadGame(lobbyId);
  if (!game) return;
  const seat = game.playerOrder.indexOf(uid);
  if (seat < 0) return;

  // Re-id so these cheat tiles never collide with the real deck/other hands.
  const tiles = shuffle(buildTileSet())
    .slice(0, 21)
    .map((tile, index) => ({ id: `dev-${uid}-r-${index}`, face: tile.face }));

  const gameRef = doc(db, GAMES_COLLECTION, lobbyId);
  await updateDoc(doc(gameRef, 'hands', uid), { tiles });
  await updateDoc(gameRef, {
    [`handCounts.${uid}`]: tiles.length,
    [`handValue.${uid}`]: handValueOf(tiles, game.okey),
    turnIndex: seat,
    turnPhase: 'discard',
  });
}

/** Empties the draw pile so the next discard ends the hand ("deste tükendi"). */
export async function devEmptyDeck(lobbyId: string): Promise<void> {
  const gameRef = doc(db, GAMES_COLLECTION, lobbyId);
  await updateDoc(gameRef, { drawCount: 0 });
  await updateDoc(doc(gameRef, 'private', 'deck'), { tiles: [] });
}

/**
 * Makes another seat (a bot) open the table for you, so cross-player işleme can
 * be tested with bots:
 *  - 'pair' lays a pairs area → a MELD opener can then çift-işle onto it.
 *  - 'meld' lays a group (three 9s, missing yellow) → a PAIR opener can then
 *    seri-işle a yellow 9 onto an opponent's series.
 * Cheat: the bot's own hand is left untouched.
 */
export async function devBotOpen(
  lobbyId: string,
  uid: string,
  kind: 'pair' | 'meld',
): Promise<void> {
  const game = await loadGame(lobbyId);
  if (!game) return;
  const botUid = game.playerOrder.find((player) => player !== uid);
  if (!botUid) return;

  const existing = game.melds ?? [];
  const added: TableMeld[] =
    kind === 'pair'
      ? Array.from({ length: 5 }, (_, i) => ({
          id: `${botUid}-p-${existing.length + i}`,
          owner: botUid,
          kind: 'pair' as const,
          tiles: [
            devTile(num('blue', i + 1), botUid),
            devTile(num('blue', i + 1), botUid),
          ],
        }))
      : [
          {
            id: `${botUid}-${existing.length}`,
            owner: botUid,
            kind: 'group',
            tiles: [
              devTile(num('blue', 9), botUid),
              devTile(num('red', 9), botUid),
              devTile(num('black', 9), botUid),
            ],
          },
        ];

  await updateDoc(doc(db, GAMES_COLLECTION, lobbyId), {
    melds: [...existing, ...added],
    [`opened.${botUid}`]: true,
    [`openedWith.${botUid}`]: kind === 'pair' ? 'pair' : 'meld',
  });
}
