import { useEffect, useState } from 'react';
import { Tile, type GameTile } from './Tile';

export interface Point {
  x: number;
  y: number;
}

export interface Flight {
  key: string;
  face?: GameTile;
  faceDown?: boolean;
  from: Point;
  to: Point;
}

const DURATION_MS = 380;

/**
 * A single tile that animates from `from` to `to`, then removes itself. Used to
 * visualise opponents drawing/discarding/taking tiles.
 */
export function FlyingTile({
  flight,
  onDone,
}: {
  flight: Flight;
  onDone: () => void;
}) {
  const [pos, setPos] = useState<Point>(flight.from);

  useEffect(() => {
    // Paint at `from`, then on the next frame transition to `to`.
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => setPos(flight.to)),
    );
    const timer = setTimeout(onDone, DURATION_MS + 60);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="pointer-events-none fixed z-40 -translate-x-1/2 -translate-y-1/2"
      style={{
        left: pos.x,
        top: pos.y,
        transition: `left ${DURATION_MS}ms ease, top ${DURATION_MS}ms ease`,
      }}
    >
      {flight.faceDown ? (
        <Tile faceDown />
      ) : flight.face ? (
        <Tile tile={flight.face} />
      ) : null}
    </div>
  );
}
