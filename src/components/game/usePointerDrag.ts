import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

interface Point {
  x: number;
  y: number;
}

/**
 * Minimal pointer-drag for a single draggable source (e.g. the deck or a
 * discard pile). Tracks the pointer and calls `onDrop` with the release
 * coordinates so the caller can hit-test the drop target. Works with mouse and
 * touch.
 */
export function usePointerDrag(onDrop: (x: number, y: number) => void) {
  const [point, setPoint] = useState<Point | null>(null);
  const dragging = point !== null;
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  useEffect(() => {
    if (!dragging) return;

    function move(event: PointerEvent) {
      setPoint({ x: event.clientX, y: event.clientY });
    }
    function up(event: PointerEvent) {
      onDropRef.current(event.clientX, event.clientY);
      setPoint(null);
    }
    // Touch browsers cancel a gesture they read as a scroll or long-press; drop
    // the drag instead of leaving it hanging with no further events coming.
    function cancel() {
      setPoint(null);
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [dragging]);

  function start(event: ReactPointerEvent) {
    event.preventDefault();
    // Keep the gesture reporting to this element once the finger moves off it.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setPoint({ x: event.clientX, y: event.clientY });
  }

  return { point, dragging, start };
}

/** True if the point is over an element matching `selector`. */
export function isOverSelector(x: number, y: number, selector: string): boolean {
  const element = document.elementFromPoint(x, y);
  return !!element?.closest(selector);
}
