import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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

  // Flights are aimed with viewport coordinates (getBoundingClientRect), so they
  // render outside the scaled stage — `position: fixed` resolves against a
  // transformed ancestor, not the viewport — and take the stage's scale to stay
  // the same size as the tiles they fly between.
  return createPortal(
    <div
      className="pointer-events-none fixed z-40"
      style={{
        left: pos.x,
        top: pos.y,
        transform: 'translate(-50%, -50%) scale(var(--stage-scale, 1))',
        transition: `left ${DURATION_MS}ms ease, top ${DURATION_MS}ms ease`,
      }}
    >
      {flight.faceDown ? (
        <Tile faceDown />
      ) : flight.face ? (
        <Tile tile={flight.face} />
      ) : null}
    </div>,
    document.body,
  );
}
