import type { PointerEvent as ReactPointerEvent } from 'react';
import { Tile, type GameTile } from './Tile';

interface BoardCenterProps {
  indicator: GameTile;
  /** Remaining tiles in the draw pile, shown on the pile. */
  drawPileCount: number;
  /** Whether the current player may draw now (deck becomes draggable). */
  canDraw?: boolean;
  /** Starts a drag from the deck (drop on the rack to draw). */
  onDeckPointerDown?: (event: ReactPointerEvent) => void;
}

/**
 * Center of the table: the indicator (gösterge) above the draw pile (deste).
 * Stacked rather than side by side — the table is far wider than it is tall, so
 * horizontal room is the scarce one, and this hands it back to the melds.
 */
export function BoardCenter({
  indicator,
  drawPileCount,
  canDraw = false,
  onDeckPointerDown,
}: BoardCenterProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl bg-black/15 px-4 py-3">
      <div className="flex flex-col items-center gap-1">
        <span className="text-xs text-stone-300">Gösterge</span>
        <Tile tile={indicator} />
      </div>

      <div className="flex flex-col items-center gap-1">
        <span className="text-xs text-stone-300">Deste</span>
        <div
          data-deck
          onPointerDown={canDraw ? onDeckPointerDown : undefined}
          className={`relative rounded-md transition-shadow ${
            canDraw ? 'cursor-grab touch-none ring-2 ring-amber-400' : ''
          }`}
        >
          <Tile faceDown />
          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-stone-100">
            {drawPileCount}
          </span>
        </div>
      </div>
    </div>
  );
}
