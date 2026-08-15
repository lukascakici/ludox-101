import { useEffect, useState, type RefObject } from 'react';

/**
 * The factor that fits a fixed `width × height` design into `containerRef`'s
 * box. Uniform (never distorts) and never upscaled past 1 — a phone gets the
 * whole table shrunk to fit instead of a layout that reflows differently on
 * every device.
 *
 * Measures the container rather than the window so CSS keeps ownership of what
 * "available" means: safe-area padding on the container is simply excluded from
 * its content box, and an on-screen keyboard or URL bar shows up as a resize.
 */
export function useViewportScale(
  containerRef: RefObject<HTMLElement | null>,
  width: number,
  height: number,
): number {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    function measure() {
      if (!element) return;
      const { width: availableX, height: availableY } =
        element.getBoundingClientRect();
      const next = Math.min(availableX / width, availableY / height, 1);
      // Guard against a zero/NaN measurement during layout thrash.
      setScale(next > 0 && Number.isFinite(next) ? next : 1);
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    // Orientation changes can settle after the resize fires; re-measure then.
    window.addEventListener('orientationchange', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('orientationchange', measure);
    };
  }, [containerRef, width, height]);

  return scale;
}
