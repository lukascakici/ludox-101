import type { TileColor, TileFace } from '@/game/tiles';

export type { TileColor };
/** The visible face of a tile (sourced from the game domain model). */
export type GameTile = TileFace;

const numberColorClasses: Record<TileColor, string> = {
  red: 'text-red-600',
  black: 'text-zinc-900',
  blue: 'text-blue-700',
  yellow: 'text-amber-500',
};

/** Tile render size: 'md' on the rack, 'sm' for the compact open area. */
export type TileSize = 'md' | 'sm';

const sizeClasses: Record<TileSize, { box: string; text: string; mark: string }> =
  {
    md: { box: 'h-12 w-9', text: 'text-lg', mark: 'h-3.5 w-3.5' },
    sm: { box: 'h-8 w-6', text: 'text-sm', mark: 'h-2.5 w-2.5' },
  };

interface TileProps {
  tile?: GameTile;
  /** Render the back of a tile (hidden value). */
  faceDown?: boolean;
  /** Render as the okey — a blank white tile (its value is hidden). */
  asOkey?: boolean;
  /** Render size (default 'md'). */
  size?: TileSize;
}

/** A single Okey tile, sized to fit on the rack ('md') or the open area ('sm'). */
export function Tile({
  tile,
  faceDown = false,
  asOkey = false,
  size = 'md',
}: TileProps) {
  const s = sizeClasses[size];

  if (faceDown || !tile) {
    return (
      <div
        className={`${s.box} shrink-0 rounded-md border border-emerald-950/60 bg-emerald-800 shadow-sm`}
      />
    );
  }

  if (asOkey) {
    return (
      <div
        className={`${s.box} shrink-0 rounded-md border border-zinc-300 bg-white shadow-sm`}
      />
    );
  }

  return (
    <div
      className={`flex ${s.box} shrink-0 flex-col items-center justify-center rounded-md border border-zinc-300 bg-stone-50 shadow-sm`}
    >
      {tile.kind === 'number' ? (
        <span
          className={`${s.text} font-bold leading-none ${numberColorClasses[tile.color]}`}
        >
          {tile.value}
        </span>
      ) : (
        // False joker (sahte okey): a small diamond mark, no emoji.
        <span
          className={`block ${s.mark} rotate-45 border-2 border-zinc-800`}
        />
      )}
    </div>
  );
}
