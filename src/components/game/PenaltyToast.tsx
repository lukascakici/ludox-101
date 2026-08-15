import { useEffect } from 'react';
import { Tile } from './Tile';
import type { PenaltyEntry } from '@/types/game';

/** How long a single toast stays on screen. */
const TOAST_MS = 1500;

export interface PenaltyToastItem {
  /** Stable key — the penalty's index in the round's penaltyLog. */
  id: string;
  entry: PenaltyEntry;
  /** Display name of the penalised player. */
  name: string;
  /** Turkish label for the penalty reason. */
  label: string;
}

/**
 * One penalty announcement. Self-removing after `TOAST_MS`, following the same
 * timer pattern as FlyingTile. Rewards (negative points) render green.
 */
function Toast({
  item,
  onDone,
}: {
  item: PenaltyToastItem;
  onDone: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDone, TOAST_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { entry, name, label } = item;
  const isReward = entry.points < 0;

  return (
    <div
      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm shadow-lg ring-1 backdrop-blur-sm ${
        isReward
          ? 'bg-emerald-950/85 text-emerald-100 ring-emerald-400/40'
          : 'bg-red-950/85 text-red-100 ring-red-400/40'
      }`}
    >
      <span className="truncate font-semibold">{name}</span>
      <span className="truncate opacity-90">{label}</span>
      {entry.tile && <Tile tile={entry.tile} size="sm" />}
      <span className="tabular-nums font-bold">
        {isReward ? entry.points : `+${entry.points}`}
      </span>
    </div>
  );
}

/**
 * Live penalty announcements, stacked at the top of the table. Exists so a
 * charge is visible the moment it happens — the scoreboard only shows them at
 * round end, by which point it's guesswork which move caused what.
 */
export function PenaltyToasts({
  items,
  onExpire,
}: {
  items: PenaltyToastItem[];
  onExpire: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="pointer-events-none fixed left-1/2 top-3 z-50 flex -translate-x-1/2 flex-col items-center gap-1.5">
      {items.map((item) => (
        <Toast key={item.id} item={item} onDone={() => onExpire(item.id)} />
      ))}
    </div>
  );
}
