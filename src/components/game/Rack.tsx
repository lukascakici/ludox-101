import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Tile } from './Tile';
import { isOkeyTile, type OkeyMatch } from '@/game/okey';
import type { Tile as TileModel } from '@/game/tiles';

interface RackProps {
  /** The player's hand from the server (source of truth). */
  tiles: TileModel[];
  /** The okey for this round, so okey tiles render blank/white. */
  okey: OkeyMatch | null;
  /** Whether dropping a tile on the discard zone discards it. */
  canDiscard?: boolean;
  /** Called with the tile id when a tile is dragged to the discard zone. */
  onDiscard?: (tileId: string) => void;
  /** Slots per row. Kept larger than a typical hand so there's room to arrange. */
  slotsPerRow?: number;
}

interface DragState {
  fromIndex: number;
  tile: TileModel;
  x: number;
  y: number;
}

/**
 * The player's rack (ıstaka). Tiles can be dragged between slots to rearrange
 * (local only) or dragged to the discard zone to throw them. The slot layout
 * reconciles with the server hand: drawn tiles appear in the first free slot and
 * discarded tiles leave, while the rest keep their place.
 */
export function Rack({
  tiles,
  okey,
  canDiscard = false,
  onDiscard,
  slotsPerRow = 16,
}: RackProps) {
  const totalSlots = slotsPerRow * 2;
  const [slots, setSlots] = useState<(TileModel | null)[]>(() =>
    Array.from({ length: totalSlots }, (_, index) => tiles[index] ?? null),
  );
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  // Keep the latest props available to the (debounced) reconcile effect.
  const tilesRef = useRef(tiles);
  tilesRef.current = tiles;
  const canDiscardRef = useRef(canDiscard);
  canDiscardRef.current = canDiscard;
  const onDiscardRef = useRef(onDiscard);
  onDiscardRef.current = onDiscard;

  // Reconcile local slots with the server hand whenever the tile set changes:
  // keep placed tiles, drop missing ones, and add new ones to free slots.
  const idsKey = tiles.map((tile) => tile.id).join(',');
  useEffect(() => {
    setSlots((prev) => {
      const want = tilesRef.current;
      const present = new Set(want.map((tile) => tile.id));
      const next = prev.map((slot) =>
        slot && present.has(slot.id) ? slot : null,
      );
      const placed = new Set(
        next.filter((slot): slot is TileModel => slot !== null).map((s) => s.id),
      );
      const toAdd = want.filter((tile) => !placed.has(tile.id));
      let addIndex = 0;
      for (let i = 0; i < next.length && addIndex < toAdd.length; i++) {
        if (!next[i]) next[i] = toAdd[addIndex++];
      }
      return next;
    });
  }, [idsKey]);

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

        // Dropped on your own discard pile -> discard the tile.
        if (
          element?.closest('[data-discard-target]') &&
          canDiscardRef.current &&
          onDiscardRef.current
        ) {
          onDiscardRef.current(active.tile.id);
          setSlots((prev) =>
            prev.map((slot, index) =>
              index === active.fromIndex ? null : slot,
            ),
          );
          setDrag(null);
          return;
        }

        // Dropped on another slot -> swap.
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
  }, [drag?.fromIndex]);

  function handlePointerDown(event: ReactPointerEvent, index: number) {
    const tile = slots[index];
    if (!tile) return;
    event.preventDefault();
    setDrag({ fromIndex: index, tile, x: event.clientX, y: event.clientY });
  }

  const rows = [slots.slice(0, slotsPerRow), slots.slice(slotsPerRow)];

  return (
    <div data-rack-zone className="w-full select-none overflow-x-auto">
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
                      <Tile tile={tile.face} asOkey={isOkeyTile(tile.face, okey)} />
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

      {drag && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2"
          style={{ left: drag.x, top: drag.y }}
        >
          <Tile tile={drag.tile.face} asOkey={isOkeyTile(drag.tile.face, okey)} />
        </div>
      )}
    </div>
  );
}
