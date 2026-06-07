import { Link } from 'react-router-dom';
import { Seat } from './Seat';
import { BoardCenter } from './BoardCenter';
import { Rack } from './Rack';
import { computeOkey } from './okey';
import { SAMPLE_HAND, SAMPLE_INDICATOR } from './sampleHand';
import type { Lobby } from '@/types/lobby';

interface GameTableProps {
  lobby: Lobby;
  currentUid: string | undefined;
}

// Placeholder tile count per opponent until the engine deals real tiles.
const PLACEHOLDER_TILE_COUNT = 14;

/**
 * Static table shell (no game logic yet). Lays out 4 seats around a checkered
 * felt table in landscape: the current player at the bottom with their rack,
 * and the three opponents at the top, left, and right.
 */
export function GameTable({ lobby, currentUid }: GameTableProps) {
  const me = lobby.players.find((p) => p.uid === currentUid);
  const opponents = lobby.players.filter((p) => p.uid !== currentUid);
  const [topOpponent, leftOpponent, rightOpponent] = opponents;
  const okey = computeOkey(SAMPLE_INDICATOR);

  return (
    <div className="table-felt flex h-dvh flex-col text-stone-100">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between px-4 py-2">
        <span className="text-sm font-semibold tracking-tight">
          {lobby.name}
        </span>
        <Link
          to={`/lobby/${lobby.id}`}
          className="rounded-md border border-stone-100/30 px-3 py-1 text-xs font-medium text-stone-100 transition-colors hover:bg-white/10"
        >
          Lobiye dön
        </Link>
      </div>

      {/* Table area with seats around the center */}
      <div className="relative flex-1">
        {topOpponent && (
          <div className="absolute left-1/2 top-3 -translate-x-1/2">
            <Seat name={topOpponent.displayName} tileCount={PLACEHOLDER_TILE_COUNT} />
          </div>
        )}
        {leftOpponent && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2">
            <Seat name={leftOpponent.displayName} tileCount={PLACEHOLDER_TILE_COUNT} />
          </div>
        )}
        {rightOpponent && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Seat name={rightOpponent.displayName} tileCount={PLACEHOLDER_TILE_COUNT} />
          </div>
        )}

        <div className="absolute inset-0 flex items-center justify-center">
          <BoardCenter indicator={SAMPLE_INDICATOR} />
        </div>
      </div>

      {/* Current player's rack */}
      <div className="flex shrink-0 flex-col items-center gap-1 px-2 pb-3">
        <span className="text-xs text-stone-300">
          {me?.displayName ?? 'Sen'}
        </span>
        <Rack tiles={SAMPLE_HAND} okey={okey} />
      </div>
    </div>
  );
}
