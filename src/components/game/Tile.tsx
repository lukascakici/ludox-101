export type TileColor = 'red' | 'black' | 'blue' | 'yellow';

/** A game tile: a numbered color tile, or a false joker (sahte okey). */
export type GameTile =
  | { kind: 'number'; color: TileColor; value: number }
  | { kind: 'false-joker' };

const numberColorClasses: Record<TileColor, string> = {
  red: 'text-red-600',
  black: 'text-zinc-900',
  blue: 'text-blue-700',
  yellow: 'text-amber-500',
};

interface TileProps {
  tile?: GameTile;
  /** Render the back of a tile (hidden value). */
  faceDown?: boolean;
  /** Render as the okey — a blank white tile (its value is hidden). */
  asOkey?: boolean;
}

/** A single Okey tile, sized to fit on the rack. */
export function Tile({ tile, faceDown = false, asOkey = false }: TileProps) {
  if (faceDown || !tile) {
    return (
      <div className="h-12 w-9 shrink-0 rounded-md border border-emerald-950/60 bg-emerald-800 shadow-sm" />
    );
  }

  if (asOkey) {
    return (
      <div className="h-12 w-9 shrink-0 rounded-md border border-zinc-300 bg-white shadow-sm" />
    );
  }

  return (
    <div className="flex h-12 w-9 shrink-0 flex-col items-center justify-center rounded-md border border-zinc-300 bg-stone-50 shadow-sm">
      {tile.kind === 'number' ? (
        <span
          className={`text-lg font-bold leading-none ${numberColorClasses[tile.color]}`}
        >
          {tile.value}
        </span>
      ) : (
        // False joker (sahte okey): a small diamond mark, no emoji.
        <span className="block h-3.5 w-3.5 rotate-45 border-2 border-zinc-800" />
      )}
    </div>
  );
}
