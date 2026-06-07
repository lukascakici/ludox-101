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

/** Center of the table: the indicator (gösterge) and the draw pile (deste). */
export function BoardCenter({
  indicator,
  drawPileCount,
  canDraw = false,
  onDeckPointerDown,
}: BoardCenterProps) {
  return (
    <div className="flex items-center gap-6 rounded-xl bg-black/15 px-6 py-4">
      <div className="flex flex-col items-center gap-1.5">
        <span className="text-xs text-stone-300">Gösterge</span>
        <Tile tile={indicator} />
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <span className="text-xs text-stone-300">Deste</span>
        <div
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
