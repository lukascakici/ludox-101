import { useEffect, useRef } from 'react';
import { useViewportScale } from './useViewportScale';

/**
 * The design size the table is laid out at. Every position, tile and gap inside
 * the stage is authored against these numbers, then scaled as one piece — so a
 * 375px-tall phone and a desktop window get the identical layout, just smaller.
 */
export const STAGE_WIDTH = 1000;
export const STAGE_HEIGHT = 560;

/**
 * Fits the fixed-size game table into whatever viewport it's given with a single
 * uniform transform. Replaces per-breakpoint reflow, which left the table's
 * absolutely-positioned seats, piles and rack overlapping each other on short
 * landscape phones.
 *
 * The live factor is published as `--stage-scale` so the few things that must
 * render OUTSIDE the stage (drag ghost, flying tiles — `position: fixed` breaks
 * inside a transformed ancestor) can match its size.
 */
export function GameStage({ children }: { children: React.ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const scale = useViewportScale(frameRef, STAGE_WIDTH, STAGE_HEIGHT);

  useEffect(() => {
    document.documentElement.style.setProperty('--stage-scale', String(scale));
    return () => {
      document.documentElement.style.removeProperty('--stage-scale');
    };
  }, [scale]);

  return (
    // The padded outer box owns the safe area; the inner box is what gets
    // measured, so notch insets are excluded from the fit without any JS
    // reading env() values back.
    <div className="table-felt touch-play safe-inset fixed inset-0 overflow-hidden">
      <div
        ref={frameRef}
        className="flex h-full w-full items-center justify-center"
      >
        <div
          className="shrink-0"
          style={{
            width: STAGE_WIDTH,
            height: STAGE_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: 'center',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
