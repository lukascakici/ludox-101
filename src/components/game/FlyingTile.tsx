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
  /** Delay before the slide starts (ms) — used to stagger multiple tiles. */
  delay?: number;
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
    const delay = flight.delay ?? 0;
    let raf = 0;
    // Wait out the stagger delay, then paint at `from` and slide to `to`.
    const start = setTimeout(() => {
      raf = requestAnimationFrame(() =>
        requestAnimationFrame(() => setPos(flight.to)),
      );
    }, delay);
    const done = setTimeout(onDone, delay + DURATION_MS + 60);
    return () => {
      clearTimeout(start);
      cancelAnimationFrame(raf);
      clearTimeout(done);
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
