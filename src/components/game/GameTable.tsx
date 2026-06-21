import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Seat } from './Seat';
import { BoardCenter } from './BoardCenter';
import { DiscardPile } from './DiscardPile';
import { Rack, type RackHandle } from './Rack';
import { Tile } from './Tile';
import { FlyingTile, type Flight, type Point } from './FlyingTile';
import { usePointerDrag, isOverSelector } from './usePointerDrag';
import { computeOkey, isOkeyTile } from '@/game/okey';
import { classifyMeld } from '@/game/melds';
import {
  arrangeBestMelds,
  arrangePairs,
  scoreArrangement,
} from '@/game/arrange';
import type { GameTile } from './Tile';
import type { Tile as TileModel } from '@/game/tiles';
import type { Lobby } from '@/types/lobby';
import type { TableMeld } from '@/types/game';

interface GameTableProps {
  lobby: Lobby;
  currentUid: string | undefined;
  hand: TileModel[];
  indicator: GameTile;
  handCounts: Record<string, number>;
  drawPileCount: number;
  /** Player uids in seat order (the turn/throw-right cycle). */
  playerOrder: string[];
  /** Discards per seat index ('0'..). */
  discards: Record<string, TileModel[]>;
  turnIndex: number;
  canDraw: boolean;
  /** Whether the player may take the left neighbour's discard now. */
  canTake: boolean;
  canDiscard: boolean;
  /** Whether the player may open (lay melds) now. */
  canOpen: boolean;
  /** Whether the player has already opened (changes the lay-meld label). */
  hasOpened: boolean;
  /** How this player opened, or null if they haven't opened yet. */
  myOpenType: 'meld' | 'pair' | null;
  /** Whether a pairs area exists on the table (someone opened with pairs). */
  pairsAreaExists: boolean;
  /** Whether the player holds a tentatively-taken left tile (open or return it). */
  hasPendingTake: boolean;
  /** Id of that tentatively-taken tile (highlighted on the rack), if any. */
  pendingTileId?: string;
  /** Melds laid on the table. */
  melds: TableMeld[];
  /** Whether the player may process (işle) tiles onto table melds now. */
  canProcess: boolean;
  /** Assisted mode: show helpers (auto-arrange, score, markers, auto-işle). */
  assisted: boolean;
  /** Effective first-open target — meld point total (rises under katlama). */
  meldTarget: number;
  /** Effective first-open target — pair count (rises under katlama). */
  pairTarget: number;
  onDraw: () => void;
  onDiscard: (tileId: string) => void;
  onTakeDiscard: () => void;
  onOpen: (groups: TileModel[][]) => void;
  onLayPairs: (groups: TileModel[][]) => void;
  onReturnTake: () => void;
  onProcess: (meldId: string, tileId: string) => void;
  onAutoProcess: () => void;
}

const RACK_ZONE = '[data-rack-zone]';

/**
 * The game table in landscape. Seats are placed by the turn cycle so that the
 * player to your right (whom you discard to) is on the right and the player to
 * your left (whom you take from) is on the left. Each player's discard pile
 * sits at the corner toward their right neighbour.
 */
export function GameTable({
  lobby,
  currentUid,
  hand,
  indicator,
  handCounts,
  drawPileCount,
  playerOrder,
  discards,
  turnIndex,
  canDraw,
  canTake,
  canDiscard,
  canOpen,
  hasOpened,
  myOpenType,
  pairsAreaExists,
  hasPendingTake,
  pendingTileId,
  melds,
  canProcess,
  assisted,
  meldTarget,
  pairTarget,
  onDraw,
  onDiscard,
  onTakeDiscard,
  onOpen,
  onLayPairs,
  onReturnTake,
  onProcess,
  onAutoProcess,
}: GameTableProps) {
  const count = playerOrder.length || 1;
  const foundIndex = currentUid ? playerOrder.indexOf(currentUid) : -1;
  const myIndex = foundIndex >= 0 ? foundIndex : 0;

  const seatUid = (offset: number) => playerOrder[(myIndex + offset) % count];
  const pileAt = (offset: number): TileModel[] =>
    discards[String((myIndex + offset) % count)] ?? [];

  const rightUid = seatUid(1);
  const acrossUid = seatUid(2);
  const leftUid = seatUid(3);

  const nameOf = (uid: string | undefined) =>
    lobby.players.find((p) => p.uid === uid)?.displayName ?? '—';

  const currentTurnUid = playerOrder[turnIndex];
  const isMyTurn = currentUid === currentTurnUid;
  const okey = computeOkey(indicator);

  const leftPile = pileAt(3);
  const leftTop = leftPile[leftPile.length - 1];
  const canTakeLeft = canTake && !!leftTop;

  const [pendingSlot, setPendingSlot] = useState<number | null>(null);

  function slotAt(x: number, y: number): number | null {
    const slotElement = document.elementFromPoint(x, y)?.closest(
      '[data-slot-index]',
    );
    return slotElement
      ? Number((slotElement as HTMLElement).dataset.slotIndex)
      : null;
  }

  const rackRef = useRef<RackHandle>(null);
  const [currentGroups, setCurrentGroups] = useState<TileModel[][]>([]);
  const score = scoreArrangement(currentGroups, okey);

  // Hand tiles that can be added to some table meld (işlenebilir).
  const processableIds = new Set<string>();
  if (canProcess && assisted) {
    for (const tile of hand) {
      for (const meld of melds) {
        if (
          classifyMeld([...meld.tiles, tile].map((t) => t.face), okey)
        ) {
          processableIds.add(tile.id);
          break;
        }
      }
    }
  }
  const hasProcessable = processableIds.size > 0;

  // The open area splits into perler (runs/groups) and çiftler (pairs).
  const meldMelds = melds.filter((meld) => meld.kind !== 'pair');
  const pairMelds = melds.filter((meld) => meld.kind === 'pair');

  const deckDrag = usePointerDrag((x, y) => {
    if (isOverSelector(x, y, RACK_ZONE)) {
      setPendingSlot(slotAt(x, y));
      onDraw();
    }
  });
  const takeDrag = usePointerDrag((x, y) => {
    if (isOverSelector(x, y, RACK_ZONE)) {
      setPendingSlot(slotAt(x, y));
      onTakeDiscard();
    }
  });

  // Animate opponents' moves (draw/discard/take). Self moves are already shown
  // by the player's own drag, so they aren't animated here.
  const [flights, setFlights] = useState<Flight[]>([]);
  const flightKeyRef = useRef(0);
  // Returning a tentative take grows the left pile; suppress the false
  // "left player discarded" animation that change would otherwise trigger.
  const returningRef = useRef(false);
  const handleReturn = () => {
    returningRef.current = true;
    onReturnTake();
  };
  const prevRef = useRef<{
    handCounts: Record<string, number>;
    discards: Record<string, TileModel[]>;
    drawPileCount: number;
  } | null>(null);

  const centerOf = (selector: string): Point | null => {
    const element = document.querySelector(selector);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };
  const seatSelector = (uid: string) =>
    uid === currentUid ? '[data-rack-zone]' : `[data-seat="${uid}"]`;
  const addFlight = (flight: Omit<Flight, 'key'>) => {
    const key = `flight-${flightKeyRef.current++}`;
    setFlights((current) => [...current, { key, ...flight }]);
  };

  const changeSig = JSON.stringify({
    hc: handCounts,
    dl: Object.keys(discards).map((key) => discards[key].length),
    dc: drawPileCount,
  });

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { handCounts, discards, drawPileCount };
    if (!prev) return;

    for (const seatKey of Object.keys(discards)) {
      const seatIndex = Number(seatKey);
      const len = discards[seatKey].length;
      const prevLen = prev.discards[seatKey]?.length ?? 0;

      // Discard: a pile grew — fly from the thrower's seat to the pile.
      if (len > prevLen) {
        // A returned tentative take also grows a pile — don't animate it.
        if (returningRef.current) {
          returningRef.current = false;
          continue;
        }
        const thrower = playerOrder[seatIndex];
        const face = discards[seatKey][len - 1]?.face;
        const from = thrower ? centerOf(seatSelector(thrower)) : null;
        const to = centerOf(`[data-pile="${seatIndex}"]`);
        if (thrower && thrower !== currentUid && from && to && face) {
          addFlight({ face, from, to });
        }
      }

      // Take: a pile shrank — fly from the pile to the taker (its right seat).
      if (len < prevLen) {
        const taker = playerOrder[(seatIndex + 1) % count];
        const face = prev.discards[seatKey]?.[prevLen - 1]?.face;
        const from = centerOf(`[data-pile="${seatIndex}"]`);
        const to = taker ? centerOf(seatSelector(taker)) : null;
        // Self take/draw is not animated — the tile just stays where you drop it.
        if (taker && taker !== currentUid && from && to && face) {
          addFlight({ face, from, to });
        }
      }
    }

    // Draw: the deck shrank — fly a face-down tile from the deck to the drawer.
    if (drawPileCount < prev.drawPileCount) {
      const drawer = playerOrder.find(
        (uid) => (handCounts[uid] ?? 0) > (prev.handCounts[uid] ?? 0),
      );
      const from = centerOf('[data-deck]');
      const to = drawer ? centerOf(seatSelector(drawer)) : null;
      if (drawer && drawer !== currentUid && from && to) {
        addFlight({ faceDown: true, from, to });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changeSig]);

  // Your own discard: slide the tile from where you dropped it to your pile.
  function handleRackDiscard(tileId: string, fromX: number, fromY: number) {
    const tile = hand.find((t) => t.id === tileId);
    const to = centerOf(`[data-pile="${myIndex % count}"]`);
    if (tile && to) {
      addFlight({ face: tile.face, from: { x: fromX, y: fromY }, to });
    }
    onDiscard(tileId);
  }

  // Laying melds (anyone): slide the meld's tiles to the open area, staggered.
  const meldsInitRef = useRef(false);
  const prevMeldIdsRef = useRef<Set<string>>(new Set());
  const meldIdsSig = melds.map((m) => m.id).join(',');
  useEffect(() => {
    const prevIds = prevMeldIdsRef.current;
    const newMelds = melds.filter((m) => !prevIds.has(m.id));
    prevMeldIdsRef.current = new Set(melds.map((m) => m.id));
    if (!meldsInitRef.current) {
      meldsInitRef.current = true;
      return;
    }
    for (const meld of newMelds) {
      const from = centerOf(seatSelector(meld.owner));
      const to = centerOf(`[data-meld-anim="${meld.id}"]`);
      if (from && to) {
        meld.tiles.forEach((tile, index) => {
          addFlight({ face: tile.face, from, to, delay: index * 90 });
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meldIdsSig]);

  return (
    <div className="table-felt flex h-dvh flex-col text-stone-100">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between px-4 py-2">
        <span className="text-sm font-semibold tracking-tight">
          {lobby.name}
        </span>
        <Link
          to={`/lobby/${lobby.id}`}
          className="rounded-md border border-stone-100/30 px-3 py-1 text-xs font-medium text-stone-100 transition-colors hover:bg-white/10"
        >
          Lobiye dön
        </Link>
      </div>

      {/* Table area */}
      <div className="relative flex-1">
        {/* Opponent seats */}
        <div
          data-seat={acrossUid}
          className="absolute left-1/2 top-3 -translate-x-1/2"
        >
          <Seat
            name={nameOf(acrossUid)}
            tileCount={handCounts[acrossUid] ?? 0}
            isTurn={acrossUid === currentTurnUid}
          />
        </div>
        <div
          data-seat={leftUid}
          className="absolute left-[12%] top-1/2 -translate-y-1/2"
        >
          <Seat
            name={nameOf(leftUid)}
            tileCount={handCounts[leftUid] ?? 0}
            isTurn={leftUid === currentTurnUid}
          />
        </div>
        <div
          data-seat={rightUid}
          className="absolute right-[12%] top-1/2 -translate-y-1/2"
        >
          <Seat
            name={nameOf(rightUid)}
            tileCount={handCounts[rightUid] ?? 0}
            isTurn={rightUid === currentTurnUid}
          />
        </div>

        {/* Discard piles at the corners (each toward the thrower's right).
            Your own pile (bottom-right) is also the discard drop target. */}
        <div
          data-discard-target
          data-pile={(myIndex + 0) % count}
          className={`absolute left-[80%] top-[80%] -translate-x-1/2 -translate-y-1/2 rounded-md transition-shadow ${
            canDiscard ? 'ring-2 ring-amber-400' : ''
          }`}
        >
          <DiscardPile tiles={pileAt(0)} />
        </div>
        <div
          data-pile={(myIndex + 1) % count}
          className="absolute left-[80%] top-[20%] -translate-x-1/2 -translate-y-1/2"
        >
          <DiscardPile tiles={pileAt(1)} />
        </div>
        <div
          data-pile={(myIndex + 2) % count}
          className="absolute left-[20%] top-[20%] -translate-x-1/2 -translate-y-1/2"
        >
          <DiscardPile tiles={pileAt(2)} />
        </div>
        <div
          data-pile={(myIndex + 3) % count}
          data-return-target
          className={`absolute left-[20%] top-[80%] -translate-x-1/2 -translate-y-1/2 rounded-md ${
            hasPendingTake ? 'ring-2 ring-amber-300' : ''
          }`}
        >
          <DiscardPile
            tiles={leftPile}
            takeable={canTakeLeft}
            onPointerDown={takeDrag.start}
          />
        </div>

        {/* Center: the opening area (where melds will be laid) + deck/indicator.
            The container is click-through so corner piles stay droppable; only
            the deck re-enables pointer events. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-4 px-32">
          <div
            data-open-area
            className="pointer-events-auto flex h-[58%] min-h-44 max-h-72 max-w-4xl flex-1 gap-2 overflow-hidden rounded-xl border border-stone-100/10 bg-black/20 p-2 shadow-inner"
          >
            {/* Perler (runs/groups) — width grows with how many melds it holds. */}
            <div
              className="flex min-w-0 basis-0 flex-col"
              style={{ flexGrow: Math.max(meldMelds.length, 1) }}
            >
              <span className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                Perler
              </span>
              <div className="flex flex-1 flex-wrap content-start gap-1.5 overflow-hidden">
                {meldMelds.length === 0 ? (
                  <span className="m-auto text-xs text-stone-500">
                    Henüz per yok
                  </span>
                ) : (
                  meldMelds.map((meld) => (
                    <div
                      key={meld.id}
                      data-meld-id={meld.id}
                      data-meld-anim={meld.id}
                      className={`flex h-fit gap-0.5 rounded-md bg-black/25 p-0.5 ring-1 ${
                        canProcess ? 'ring-amber-400/60' : 'ring-black/30'
                      }`}
                    >
                      {meld.tiles.map((tile, index) => (
                        <Tile
                          key={index}
                          tile={tile.face}
                          asOkey={isOkeyTile(tile.face, okey)}
                          size="sm"
                        />
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Divider */}
            <div className="w-px shrink-0 self-stretch bg-stone-100/15" />

            {/* Çiftler (pairs) — width grows with how many pairs it holds. */}
            <div
              className="flex min-w-0 basis-0 flex-col"
              style={{ flexGrow: Math.max(pairMelds.length, 1) }}
            >
              <span className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                Çiftler
              </span>
              <div className="flex flex-1 flex-wrap content-start gap-1 overflow-hidden">
                {pairMelds.length === 0 ? (
                  <span className="m-auto text-xs text-stone-500">
                    Henüz çift yok
                  </span>
                ) : (
                  pairMelds.map((meld) => (
                    <div
                      key={meld.id}
                      data-meld-anim={meld.id}
                      className="flex h-fit gap-0.5 rounded-md bg-black/25 p-0.5 ring-1 ring-black/30"
                    >
                      {meld.tiles.map((tile, index) => (
                        <Tile
                          key={index}
                          tile={tile.face}
                          asOkey={isOkeyTile(tile.face, okey)}
                          size="sm"
                        />
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <div className="pointer-events-auto self-center">
            <BoardCenter
              indicator={indicator}
              drawPileCount={drawPileCount}
              canDraw={canDraw}
              onDeckPointerDown={deckDrag.start}
            />
          </div>
        </div>
      </div>

      {/* Rack */}
      <div className="flex shrink-0 flex-col items-center gap-1 px-2 pb-3">
        <span
          className={`text-xs ${
            isMyTurn ? 'font-semibold text-amber-300' : 'text-stone-300'
          }`}
        >
          {!isMyTurn
            ? `Sıra: ${nameOf(currentTurnUid)}`
            : hasPendingTake
              ? 'Soldan taş aldın — aç ya da geri bırak'
              : canDiscard
                ? 'Sıra sende — bir taşı sağ köşeye sürükleyip at'
                : 'Sıra sende'}
        </span>
        <div className="flex items-end justify-center gap-3">
          <Rack
            ref={rackRef}
            tiles={hand}
            okey={okey}
            canDiscard={canDiscard}
            onDiscard={handleRackDiscard}
            canProcess={canProcess}
            onProcess={onProcess}
            processableIds={processableIds}
            {...(pendingTileId ? { highlightTileId: pendingTileId } : {})}
            onReturn={handleReturn}
            onArrange={setCurrentGroups}
            incomingSlot={pendingSlot}
            onIncomingPlaced={() => setPendingSlot(null)}
            {...(currentUid
              ? { storageKey: `ludox-rack:${lobby.id}:${currentUid}` }
              : {})}
          />

          <div className="flex flex-col gap-2">
            {/* Açma ilerlemesi (x/hedef) — hedef katlamada yükselir. */}
            <div className="flex gap-1 text-xs">
              <span
                className={`rounded-md border px-2 py-1 font-semibold tabular-nums ${
                  score.series >= meldTarget
                    ? 'border-amber-400 text-amber-300'
                    : 'border-stone-100/30 text-stone-200'
                }`}
              >
                {score.series}/{meldTarget}
              </span>
              <span
                className={`rounded-md border px-2 py-1 font-semibold tabular-nums ${
                  score.pairs >= pairTarget
                    ? 'border-amber-400 text-amber-300'
                    : 'border-stone-100/30 text-stone-200'
                }`}
              >
                {score.pairs}/{pairTarget}
              </span>
            </div>

            {assisted && (
              <button
                type="button"
                onClick={() =>
                  rackRef.current?.setArrangement(arrangeBestMelds(hand, okey))
                }
                className="rounded-md border border-stone-100/30 px-3 py-1.5 text-sm font-medium text-stone-100 transition-colors hover:bg-white/10"
              >
                Seri Diz
              </button>
            )}
            {assisted && (
              <button
                type="button"
                onClick={() =>
                  rackRef.current?.setArrangement(arrangePairs(hand, okey))
                }
                className="rounded-md border border-stone-100/30 px-3 py-1.5 text-sm font-medium text-stone-100 transition-colors hover:bg-white/10"
              >
                Çift Diz
              </button>
            )}
            {assisted && (
              <button
                type="button"
                onClick={onAutoProcess}
                disabled={!(canProcess && hasProcessable)}
                className="rounded-md border border-amber-400 px-3 py-1.5 text-sm font-medium text-amber-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Otomatik İşle
              </button>
            )}

            {/* Returning a tentatively-taken left tile (when you can't open). */}
            {hasPendingTake && (
              <button
                type="button"
                onClick={handleReturn}
                className="rounded-md border border-red-400 px-3 py-1.5 text-sm font-semibold text-red-200 transition-colors hover:bg-red-500/15"
              >
                Geri Bırak
              </button>
            )}

            {/* Açma / koyma actions. The buttons stay mounted; only their
                enabled state changes per turn so the layout never shifts. */}
            {!hasOpened ? (
              <button
                type="button"
                onClick={() =>
                  // Auto-route: open with pairs only when the pair target is met
                  // and the meld total can't reach the (possibly raised) target.
                  score.series < meldTarget && score.pairs >= pairTarget
                    ? onLayPairs(currentGroups)
                    : onOpen(currentGroups)
                }
                disabled={!canOpen}
                className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-semibold text-amber-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Aç
              </button>
            ) : (
              <>
                {myOpenType !== 'pair' && (
                  <button
                    type="button"
                    onClick={() => onOpen(currentGroups)}
                    disabled={!canOpen}
                    className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-semibold text-amber-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Per Koy
                  </button>
                )}
                {(myOpenType === 'pair' || pairsAreaExists) && (
                  <button
                    type="button"
                    onClick={() => onLayPairs(currentGroups)}
                    disabled={!canOpen}
                    className="rounded-md border border-amber-400 px-3 py-1.5 text-sm font-semibold text-amber-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Çift Koy
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Floating drag previews */}
      {deckDrag.dragging && deckDrag.point && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 scale-105"
          style={{ left: deckDrag.point.x, top: deckDrag.point.y }}
        >
          <Tile faceDown />
        </div>
      )}
      {takeDrag.dragging && takeDrag.point && leftTop && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 scale-105"
          style={{ left: takeDrag.point.x, top: takeDrag.point.y }}
        >
          <Tile tile={leftTop.face} />
        </div>
      )}

      {/* Animated opponent moves */}
      {flights.map((flight) => (
        <FlyingTile
          key={flight.key}
          flight={flight}
          onDone={() =>
            setFlights((current) => current.filter((f) => f.key !== flight.key))
          }
        />
      ))}
    </div>
  );
}
