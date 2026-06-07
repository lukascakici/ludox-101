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
  /** Melds laid on the table. */
  melds: TableMeld[];
  /** Whether the player may process (işle) tiles onto table melds now. */
  canProcess: boolean;
  onDraw: () => void;
  onDiscard: (tileId: string) => void;
  onTakeDiscard: () => void;
  onOpen: (groups: TileModel[][]) => void;
  onProcess: (meldId: string, tileId: string) => void;
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
  melds,
  canProcess,
  onDraw,
  onDiscard,
  onTakeDiscard,
  onOpen,
  onProcess,
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
  const prevRef = useRef<{
    handCounts: Record<string, number>;
    discards: Record<string, TileModel[]>;
    drawPileCount: number;
  } | null>(null);

  const changeSig = JSON.stringify({
    hc: handCounts,
    dl: Object.keys(discards).map((key) => discards[key].length),
    dc: drawPileCount,
  });

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { handCounts, discards, drawPileCount };
    if (!prev) return;

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

    for (const seatKey of Object.keys(discards)) {
      const seatIndex = Number(seatKey);
      const len = discards[seatKey].length;
      const prevLen = prev.discards[seatKey]?.length ?? 0;

      // Discard: a pile grew — fly from the thrower's seat to the pile.
      if (len > prevLen) {
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
          className={`absolute bottom-2 right-2 rounded-md transition-shadow ${
            canDiscard ? 'ring-2 ring-amber-400' : ''
          }`}
        >
          <DiscardPile tiles={pileAt(0)} />
        </div>
        <div data-pile={(myIndex + 1) % count} className="absolute right-2 top-2">
          <DiscardPile tiles={pileAt(1)} />
        </div>
        <div data-pile={(myIndex + 2) % count} className="absolute left-2 top-2">
          <DiscardPile tiles={pileAt(2)} />
        </div>
        <div
          data-pile={(myIndex + 3) % count}
          className="absolute bottom-2 left-2"
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
            className="pointer-events-auto h-40 max-w-md flex-1 overflow-auto rounded-xl border border-stone-100/15 bg-black/10 p-2"
          >
            {melds.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-stone-400">
                Açma alanı
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                {melds.map((meld) => (
                  <div
                    key={meld.id}
                    data-meld-id={meld.id}
                    className={`flex gap-0.5 rounded-md ${
                      canProcess ? 'ring-1 ring-amber-400/60' : ''
                    }`}
                  >
                    {meld.tiles.map((tile, index) => (
                      <Tile
                        key={index}
                        tile={tile.face}
                        asOkey={isOkeyTile(tile.face, okey)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="pointer-events-auto">
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
          {isMyTurn
            ? canDiscard
              ? 'Sıra sende — bir taşı sağ köşeye sürükleyip at'
              : 'Sıra sende — desteden çek ya da soldakini al'
            : `Sıra: ${nameOf(currentTurnUid)}`}
        </span>
        <div className="flex items-end justify-center gap-3">
          <Rack
            ref={rackRef}
            tiles={hand}
            okey={okey}
            canDiscard={canDiscard}
            onDiscard={onDiscard}
            canProcess={canProcess}
            onProcess={onProcess}
            onArrange={setCurrentGroups}
            incomingSlot={pendingSlot}
            onIncomingPlaced={() => setPendingSlot(null)}
            {...(currentUid
              ? { storageKey: `ludox-rack:${lobby.id}:${currentUid}` }
              : {})}
          />

          <div className="flex flex-col gap-2">
            {/* Score: series points / 101 and pairs / 5 */}
            <div className="flex gap-1 text-xs">
              <span
                className={`rounded-md border px-2 py-1 font-semibold tabular-nums ${
                  score.series >= 101
                    ? 'border-amber-400 text-amber-300'
                    : 'border-stone-100/30 text-stone-200'
                }`}
              >
                {score.series}/101
              </span>
              <span
                className={`rounded-md border px-2 py-1 font-semibold tabular-nums ${
                  score.pairs >= 5
                    ? 'border-amber-400 text-amber-300'
                    : 'border-stone-100/30 text-stone-200'
                }`}
              >
                {score.pairs}/5
              </span>
            </div>

            <button
              type="button"
              onClick={() =>
                rackRef.current?.setArrangement(arrangeBestMelds(hand, okey))
              }
              className="rounded-md border border-stone-100/30 px-3 py-1.5 text-sm font-medium text-stone-100 transition-colors hover:bg-white/10"
            >
              Seri Diz
            </button>
            <button
              type="button"
              onClick={() =>
                rackRef.current?.setArrangement(arrangePairs(hand, okey))
              }
              className="rounded-md border border-stone-100/30 px-3 py-1.5 text-sm font-medium text-stone-100 transition-colors hover:bg-white/10"
            >
              Çift Diz
            </button>
            {canOpen && (
              <button
                type="button"
                onClick={() => onOpen(currentGroups)}
                className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-semibold text-amber-950 transition-colors hover:bg-amber-400"
              >
                {hasOpened ? 'Per Koy' : 'Aç'}
              </button>
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
