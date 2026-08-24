// -- React Imports --
import { useEffect, useState, type RefObject } from 'react';

/**
 * Tracks the content-box width (CSS px) of `ref` via a ResizeObserver, so the reader can render each
 * page at fit-width and re-fit on a window/panel resize. Returns 0 until the first measurement.
 */
export function usePdfContainerWidth(ref: RefObject<HTMLElement | null>): number {
   const [width, setWidth] = useState(0);

   useEffect(() => {
      const el = ref.current;
      if (!el) return;
      const observer = new ResizeObserver((entries) => {
         const entry = entries[0];
         if (entry) setWidth(entry.contentRect.width);
      });
      observer.observe(el);
      setWidth(el.clientWidth);
      return () => observer.disconnect();
   }, [ref]);

   return width;
}
