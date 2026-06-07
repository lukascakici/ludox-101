import { Tile, type GameTile } from './Tile';

/** Center of the table: the indicator (gösterge) and the draw pile. */
export function BoardCenter({ indicator }: { indicator: GameTile }) {
  return (
    <div className="flex items-center gap-6 rounded-xl bg-black/15 px-6 py-4">
      <div className="flex flex-col items-center gap-1.5">
        <span className="text-xs text-stone-300">Gösterge</span>
        <Tile tile={indicator} />
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <span className="text-xs text-stone-300">Deste</span>
        <Tile faceDown />
      </div>
    </div>
  );
}
