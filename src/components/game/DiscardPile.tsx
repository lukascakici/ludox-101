import type { PointerEvent as ReactPointerEvent } from 'react';
import { Tile } from './Tile';
import type { Tile as TileModel } from '@/game/tiles';

interface DiscardPileProps {
  tiles: TileModel[];
  /** When true (the left neighbour's pile on your draw turn), it can be taken. */
  takeable?: boolean;
  onPointerDown?: (event: ReactPointerEvent) => void;
}

/** A player's discard pile — shows the top tile (the one that can be taken). */
export function DiscardPile({
  tiles,
  takeable = false,
  onPointerDown,
}: DiscardPileProps) {
  const top = tiles[tiles.length - 1];
  const canTake = takeable && !!top;

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        onPointerDown={canTake ? onPointerDown : undefined}
        className={`rounded-md transition-shadow ${
          canTake ? 'cursor-grab touch-none ring-2 ring-amber-400' : ''
        }`}
      >
        {top ? (
          <Tile tile={top.face} />
        ) : (
          <div className="h-12 w-9 rounded-md border border-dashed border-stone-100/20" />
        )}
      </div>
      {tiles.length > 1 && (
        <span className="text-[10px] text-stone-300">{tiles.length}</span>
      )}
    </div>
  );
}
