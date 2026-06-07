import { useEffect, useRef, useState } from 'react';
import { Tile, type GameTile } from './Tile';
import { isOkeyTile, type OkeyMatch } from './okey';

interface RackProps {
  tiles: GameTile[];
  /** The okey for this round, so okey tiles render blank/white. */
  okey: OkeyMatch | null;
  /** Slots per row. Kept larger than a typical hand so there's room to arrange. */
  slotsPerRow?: number;
}

interface DragState {
  fromIndex: number;
  tile: GameTile;
  x: number;
  y: number;
}

/**
 * The player's rack (ıstaka): a wide wooden base with two rows of slots. Tiles
 * can be dragged between slots to rearrange (pointer events, so it works with
 * both mouse and touch). Dropping onto an occupied slot swaps the two tiles.
 * This is local-only; it is not yet synced to any game state.
 */
export function Rack({ tiles, okey, slotsPerRow = 16 }: RackProps) {
  const totalSlots = slotsPerRow * 2;
  const [slots, setSlots] = useState<(GameTile | null)[]>(() =>
    Array.from({ length: totalSlots }, (_, index) => tiles[index] ?? null),
  );
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  // While dragging, track the pointer globally and resolve the drop on release.
  useEffect(() => {
    if (!drag) return;

    function onMove(event: PointerEvent) {
      setDrag((current) =>
        current ? { ...current, x: event.clientX, y: event.clientY } : current,
      );
    }

    function onUp(event: PointerEvent) {
      const active = dragRef.current;
      if (active) {
        const element = document.elementFromPoint(event.clientX, event.clientY);
        const slotElement = element?.closest('[data-slot-index]');
        const target = slotElement
          ? Number((slotElement as HTMLElement).dataset.slotIndex)
          : -1;
        if (target >= 0 && target !== active.fromIndex) {
          setSlots((prev) => {
            const next = [...prev];
            next[active.fromIndex] = prev[target];
            next[target] = prev[active.fromIndex];
            return next;
          });
        }
      }
      setDrag(null);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // Re-attach only when a drag starts/ends, not on every move.
  }, [drag?.fromIndex]);

  function handlePointerDown(event: React.PointerEvent, index: number) {
    const tile = slots[index];
    if (!tile) return;
    event.preventDefault();
    setDrag({ fromIndex: index, tile, x: event.clientX, y: event.clientY });
  }

  const rows = [slots.slice(0, slotsPerRow), slots.slice(slotsPerRow)];

  return (
    <div className="w-full select-none overflow-x-auto">
      <div className="mx-auto w-fit rounded-xl bg-amber-900 p-2 shadow-lg ring-1 ring-amber-950/60">
        <div className="space-y-1.5">
          {rows.map((row, rowIndex) => (
            <div key={rowIndex} className="flex gap-1">
              {row.map((tile, columnIndex) => {
                const slotIndex = rowIndex * slotsPerRow + columnIndex;
                const isSource = drag?.fromIndex === slotIndex;
                const filled = tile && !isSource;
                return (
                  <div
                    key={slotIndex}
                    data-slot-index={slotIndex}
                    onPointerDown={(e) => handlePointerDown(e, slotIndex)}
                    className={`rounded-md ${filled ? 'cursor-grab touch-none' : ''}`}
                  >
                    {filled ? (
                      <Tile tile={tile} asOkey={isOkeyTile(tile, okey)} />
                    ) : (
                      <div className="h-12 w-9 rounded-md bg-amber-950/30" />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Floating tile that follows the pointer while dragging. */}
      {drag && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2"
          style={{ left: drag.x, top: drag.y }}
        >
          <Tile tile={drag.tile} asOkey={isOkeyTile(drag.tile, okey)} />
        </div>
      )}
    </div>
  );
}
