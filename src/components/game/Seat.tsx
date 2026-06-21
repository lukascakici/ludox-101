interface SeatProps {
  name: string;
  /** Number of tiles the opponent holds (rendered as face-down backs). */
  tileCount: number;
  /** Highlight when it's this player's turn (static ring, no animation). */
  isTurn?: boolean;
  /** Whether this player's heartbeat is stale (disconnected). */
  offline?: boolean;
}

/** An opponent's seat: name plus a small fan of face-down tiles. */
export function Seat({
  name,
  tileCount,
  isTurn = false,
  offline = false,
}: SeatProps) {
  const shown = Math.min(tileCount, 6);

  return (
    <div
      className={`flex flex-col items-center gap-1.5 rounded-lg bg-black/20 px-3 py-2 ${
        isTurn ? 'ring-2 ring-amber-400' : ''
      } ${offline ? 'opacity-60' : ''}`}
    >
      <span className="max-w-28 truncate text-sm font-medium text-stone-100">
        {name}
      </span>
      {offline ? (
        <span className="text-[10px] font-medium text-stone-400">
          bağlantısı koptu
        </span>
      ) : (
        <div className="flex -space-x-3">
          {Array.from({ length: shown }).map((_, index) => (
            <div
              key={index}
              className="h-7 w-5 rounded border border-emerald-950/60 bg-emerald-800"
            />
          ))}
        </div>
      )}
    </div>
  );
}
