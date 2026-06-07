import { Tile, type GameTile } from './Tile';
import { isOkeyTile, type OkeyMatch } from './okey';

interface RackProps {
  tiles: GameTile[];
  /** The okey for this round, so okey tiles render blank/white. */
  okey: OkeyMatch | null;
  /** Slots per row. Kept larger than a typical hand so there's room to arrange. */
  slotsPerRow?: number;
}

/** An empty rack slot (a recess where a tile can sit). */
function EmptySlot() {
  return <div className="h-12 w-9 shrink-0 rounded-md bg-amber-950/30" />;
}

/**
 * The player's rack (ıstaka): a wide wooden base with two rows of slots. There
 * are more slots than tiles so the player has room to move tiles around (drag
 * to rearrange comes next). Scrolls horizontally on narrow screens.
 */
export function Rack({ tiles, okey, slotsPerRow = 16 }: RackProps) {
  const totalSlots = slotsPerRow * 2;
  const slots: (GameTile | null)[] = Array.from(
    { length: totalSlots },
    (_, index) => tiles[index] ?? null,
  );
  const rows = [slots.slice(0, slotsPerRow), slots.slice(slotsPerRow)];

  return (
    <div className="w-full overflow-x-auto">
      <div className="mx-auto w-fit rounded-xl bg-amber-900 p-2 shadow-lg ring-1 ring-amber-950/60">
        <div className="space-y-1.5">
          {rows.map((row, rowIndex) => (
            <div key={rowIndex} className="flex gap-1">
              {row.map((tile, slotIndex) =>
                tile ? (
                  <Tile
                    key={slotIndex}
                    tile={tile}
                    asOkey={isOkeyTile(tile, okey)}
                  />
                ) : (
                  <EmptySlot key={slotIndex} />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
