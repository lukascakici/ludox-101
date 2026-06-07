import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Tile } from './Tile';
import { isOkeyTile, type OkeyMatch } from '@/game/okey';
import type { Arrangement } from '@/game/arrange';
import type { Tile as TileModel } from '@/game/tiles';

export interface RackHandle {
  /** Lays the given arrangement (melds/pairs + loose) onto the rack. */
  setArrangement: (arrangement: Arrangement) => void;
}

interface RackProps {
  /** The player's hand from the server (source of truth). */
  tiles: TileModel[];
  /** The okey for this round, so okey tiles render blank/white. */
  okey: OkeyMatch | null;
  /** Whether dropping a tile on the discard zone discards it. */
  canDiscard?: boolean;
  /** Called when a tile is dragged to the discard pile (with the drop point). */
  onDiscard?: (tileId: string, fromX: number, fromY: number) => void;
  /** Slots per row. Kept larger than a typical hand so there's room to arrange. */
  slotsPerRow?: number;
  /** localStorage key to persist the rack arrangement across refreshes. */
  storageKey?: string;
  /** Preferred slot for the next incoming (drawn/taken) tile. */
  incomingSlot?: number | null;
  /** Called once the incoming tile has been placed. */
  onIncomingPlaced?: () => void;
  /** Whether dragging a tile onto a table meld processes (işler) it. */
  canProcess?: boolean;
  /** Called with (meldId, tileId) when a tile is dropped on a table meld. */
  onProcess?: (meldId: string, tileId: string) => void;
  /** Ids of hand tiles that can be processed onto a table meld (show a marker). */
  processableIds?: Set<string>;
  /** Reports the rack's contiguous groups (per row) whenever they change. */
  onArrange?: (groups: TileModel[][]) => void;
}

interface DragState {
  fromIndex: number;
  tile: TileModel;
  x: number;
  y: number;
}

/** Contiguous tile groups per row (separated by empty slots). */
function groupsFromSlots(
  slots: (TileModel | null)[],
  slotsPerRow: number,
): TileModel[][] {
  const groups: TileModel[][] = [];
  for (let row = 0; row < 2; row++) {
    let current: TileModel[] = [];
    for (let col = 0; col < slotsPerRow; col++) {
      const tile = slots[row * slotsPerRow + col];
      if (tile) {
        current.push(tile);
      } else if (current.length) {
        groups.push(current);
        current = [];
      }
    }
    if (current.length) groups.push(current);
  }
  return groups;
}

/**
 * Builds the slot layout: restore saved positions (by tile id) for tiles still
 * in hand, then place any remaining tiles in the first free slots.
 */
function buildSlots(
  tiles: TileModel[],
  totalSlots: number,
  storageKey: string | undefined,
): (TileModel | null)[] {
  const byId = new Map(tiles.map((tile) => [tile.id, tile]));
  const slots: (TileModel | null)[] = Array.from(
    { length: totalSlots },
    () => null,
  );
  const placed = new Set<string>();

  if (storageKey) {
    try {
      const raw = localStorage.getItem(storageKey);
      const saved = raw ? (JSON.parse(raw) as (string | null)[]) : null;
      if (Array.isArray(saved)) {
        for (let i = 0; i < totalSlots && i < saved.length; i++) {
          const id = saved[i];
          if (id && byId.has(id) && !placed.has(id)) {
            slots[i] = byId.get(id) ?? null;
            placed.add(id);
          }
        }
      }
    } catch {
      // Ignore malformed/unavailable storage.
    }
  }

  const remaining = tiles.filter((tile) => !placed.has(tile.id));
  let addIndex = 0;
  for (let i = 0; i < totalSlots && addIndex < remaining.length; i++) {
    if (!slots[i]) slots[i] = remaining[addIndex++];
  }
  return slots;
}

/**
 * The player's rack (ıstaka). Tiles can be dragged between slots, to the discard
 * pile, or onto a table meld. The auto-arrange buttons drive it via `ref`.
 */
export const Rack = forwardRef<RackHandle, RackProps>(function Rack(
  {
    tiles,
    okey,
    canDiscard = false,
    onDiscard,
    slotsPerRow = 16,
    storageKey,
    incomingSlot = null,
    onIncomingPlaced,
    canProcess = false,
    onProcess,
    processableIds,
    onArrange,
  },
  ref,
) {
  const totalSlots = slotsPerRow * 2;
  const [slots, setSlots] = useState<(TileModel | null)[]>(() =>
    buildSlots(tiles, totalSlots, storageKey),
  );
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  // Keep the latest props available to effects/handlers.
  const tilesRef = useRef(tiles);
  tilesRef.current = tiles;
  const canDiscardRef = useRef(canDiscard);
  canDiscardRef.current = canDiscard;
  const onDiscardRef = useRef(onDiscard);
  onDiscardRef.current = onDiscard;
  const incomingSlotRef = useRef(incomingSlot);
  incomingSlotRef.current = incomingSlot;
  const onIncomingPlacedRef = useRef(onIncomingPlaced);
  onIncomingPlacedRef.current = onIncomingPlaced;
  const canProcessRef = useRef(canProcess);
  canProcessRef.current = canProcess;
  const onProcessRef = useRef(onProcess);
  onProcessRef.current = onProcess;
  const onArrangeRef = useRef(onArrange);
  onArrangeRef.current = onArrange;

  // Persist the arrangement and report groups whenever the slots change.
  useEffect(() => {
    if (storageKey) {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify(slots.map((slot) => slot?.id ?? null)),
        );
      } catch {
        // Ignore storage write failures.
      }
    }
    onArrangeRef.current?.(groupsFromSlots(slots, slotsPerRow));
  }, [slots, storageKey, slotsPerRow]);

  // Lay an auto-arranged set of groups (melds/pairs) + loose tiles.
  useImperativeHandle(
    ref,
    () => ({
      setArrangement(arrangement: Arrangement) {
        const next: (TileModel | null)[] = Array.from(
          { length: totalSlots },
          () => null,
        );
        let i = 0;
        const place = (seq: TileModel[], gapAfter: boolean) => {
          const col = i % slotsPerRow;
          if (col !== 0 && col + seq.length > slotsPerRow) {
            i = (Math.floor(i / slotsPerRow) + 1) * slotsPerRow; // next row
          }
          for (const tile of seq) {
            if (i < totalSlots) next[i++] = tile;
          }
          if (gapAfter) i++;
        };
        arrangement.groups.forEach((group) => place(group, true));
        if (arrangement.loose.length) place(arrangement.loose, false);
        setSlots(next);
      },
    }),
    [slotsPerRow, totalSlots],
  );

  // Reconcile local slots with the server hand whenever the tile set changes.
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

      const target = incomingSlotRef.current;
      if (
        target != null &&
        target >= 0 &&
        target < next.length &&
        !next[target] &&
        addIndex < toAdd.length
      ) {
        next[target] = toAdd[addIndex++];
        onIncomingPlacedRef.current?.();
      }

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

        // Dropped on a table meld -> process (işle) the tile onto it.
        const meldElement = element?.closest('[data-meld-id]');
        if (meldElement && canProcessRef.current && onProcessRef.current) {
          const meldId = (meldElement as HTMLElement).dataset.meldId;
          if (meldId) {
            // Don't clear optimistically — if the server rejects (invalid), the
            // tile stays; on success the hand update removes it via reconcile.
            onProcessRef.current(meldId, active.tile.id);
            setDrag(null);
            return;
          }
        }

        // Dropped on your own discard pile -> discard the tile.
        if (
          element?.closest('[data-discard-target]') &&
          canDiscardRef.current &&
          onDiscardRef.current
        ) {
          onDiscardRef.current(active.tile.id, event.clientX, event.clientY);
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
    <div className="select-none">
      <div data-rack-zone className="overflow-x-auto">
        <div className="w-fit rounded-lg bg-amber-900 p-2 shadow-xl ring-1 ring-black/40">
          <div className="space-y-1.5">
            {rows.map((row, rowIndex) => (
              <div
                key={rowIndex}
                className="flex gap-0.5 rounded-md bg-amber-800/60 px-1 pb-1.5 pt-1 shadow-inner"
              >
                {row.map((tile, columnIndex) => {
                  const slotIndex = rowIndex * slotsPerRow + columnIndex;
                  const isSource = drag?.fromIndex === slotIndex;
                  const filled = tile && !isSource;
                  return (
                    <div
                      key={slotIndex}
                      data-slot-index={slotIndex}
                      onPointerDown={(e) => handlePointerDown(e, slotIndex)}
                      className={`relative ${filled ? 'cursor-grab touch-none' : ''}`}
                    >
                      {filled ? (
                        <Tile
                          tile={tile.face}
                          asOkey={isOkeyTile(tile.face, okey)}
                        />
                      ) : (
                        <div className="h-12 w-9" />
                      )}
                      {filled && processableIds?.has(tile.id) && (
                        <span className="pointer-events-none absolute left-1/2 top-full z-10 flex h-3 w-3 -translate-x-1/2 -translate-y-[55%] items-center justify-center rounded-full border-2 border-red-500 bg-amber-900">
                          <span className="h-1 w-1 rounded-full bg-red-500" />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
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
});
