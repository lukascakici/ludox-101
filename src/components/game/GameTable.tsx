import { Link } from 'react-router-dom';
import { Seat } from './Seat';
import { BoardCenter } from './BoardCenter';
import { DiscardPile } from './DiscardPile';
import { Rack } from './Rack';
import { Tile } from './Tile';
import { usePointerDrag, isOverSelector } from './usePointerDrag';
import { computeOkey } from '@/game/okey';
import type { GameTile } from './Tile';
import type { Tile as TileModel } from '@/game/tiles';
import type { Lobby } from '@/types/lobby';

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
  onDraw: () => void;
  onDiscard: (tileId: string) => void;
  onTakeDiscard: () => void;
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
  onDraw,
  onDiscard,
  onTakeDiscard,
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

  const deckDrag = usePointerDrag((x, y) => {
    if (isOverSelector(x, y, RACK_ZONE)) onDraw();
  });
  const takeDrag = usePointerDrag((x, y) => {
    if (isOverSelector(x, y, RACK_ZONE)) onTakeDiscard();
  });

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
        <div className="absolute left-1/2 top-3 -translate-x-1/2">
          <Seat
            name={nameOf(acrossUid)}
            tileCount={handCounts[acrossUid] ?? 0}
            isTurn={acrossUid === currentTurnUid}
          />
        </div>
        <div className="absolute left-[12%] top-1/2 -translate-y-1/2">
          <Seat
            name={nameOf(leftUid)}
            tileCount={handCounts[leftUid] ?? 0}
            isTurn={leftUid === currentTurnUid}
          />
        </div>
        <div className="absolute right-[12%] top-1/2 -translate-y-1/2">
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
          className={`absolute bottom-2 right-2 rounded-md transition-shadow ${
            canDiscard ? 'ring-2 ring-amber-400' : ''
          }`}
        >
          <DiscardPile tiles={pileAt(0)} />
        </div>
        <div className="absolute right-2 top-2">
          <DiscardPile tiles={pileAt(1)} />
        </div>
        <div className="absolute left-2 top-2">
          <DiscardPile tiles={pileAt(2)} />
        </div>
        <div className="absolute bottom-2 left-2">
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
            className="flex h-40 max-w-md flex-1 items-center justify-center rounded-xl border border-stone-100/15 bg-black/10 text-xs text-stone-400"
          >
            Açma alanı
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
        <Rack
          tiles={hand}
          okey={okey}
          canDiscard={canDiscard}
          onDiscard={onDiscard}
        />
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
    </div>
  );
}
