interface SeatProps {
  name: string;
  /** Number of tiles the opponent holds. */
  tileCount: number;
  /** Highlight when it's this player's turn. */
  isTurn?: boolean;
  /** Whether this player's heartbeat is stale (disconnected). */
  offline?: boolean;
  /** Turn clock, used to drain the ring. Only meaningful while `isTurn`. */
  turnStartedMs?: number | null;
  turnDeadlineMs?: number | null;
}

/**
 * An opponent's seat: their name, tile count, and — on the player whose turn it
 * is — a ring that drains away as their clock runs down. The ring doubles as
 * the turn indicator, so the countdown is readable from the seat itself rather
 * than only from the number beside the rack.
 */
export function Seat({
  name,
  tileCount,
  isTurn = false,
  offline = false,
  turnStartedMs = null,
  turnDeadlineMs = null,
}: SeatProps) {
  const totalMs =
    isTurn && turnStartedMs != null && turnDeadlineMs != null
      ? turnDeadlineMs - turnStartedMs
      : 0;
  const showRing = totalMs > 0;
  // How far into the turn we already are — fed to the animation as a negative
  // delay so a seat that mounts mid-turn picks the ring up where it should be.
  const elapsedMs = showRing
    ? Math.min(totalMs, Math.max(0, Date.now() - (turnStartedMs ?? 0)))
    : 0;

  return (
    <div
      className={`relative flex min-w-24 flex-col items-center gap-0.5 rounded-lg bg-black/20 px-3 py-2 ${
        isTurn && !showRing ? 'ring-2 ring-amber-400' : ''
      } ${offline ? 'opacity-60' : ''}`}
    >
      {showRing && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        >
          <rect
            // Restart the drain whenever a new turn begins.
            key={turnStartedMs}
            width="100%"
            height="100%"
            rx="8"
            ry="8"
            fill="none"
            stroke="#fbbf24"
            strokeWidth="2"
            pathLength={1}
            strokeDasharray={1}
            style={{
              animation: `turn-ring-deplete ${totalMs}ms linear ${-elapsedMs}ms forwards`,
            }}
          />
        </svg>
      )}

      <span className="max-w-28 truncate text-center text-sm font-medium text-stone-100">
        {name}
      </span>
      {offline ? (
        <span className="text-[10px] font-medium text-stone-400">
          bağlantısı koptu
        </span>
      ) : (
        <span className="text-[11px] tabular-nums text-stone-400">
          {tileCount} taş
        </span>
      )}
    </div>
  );
}
