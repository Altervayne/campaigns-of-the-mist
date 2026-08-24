// -- React Imports --
import { useEffect, useRef, useState } from 'react';

/*
 * Follows `width` but only settles after it stops changing for `delayMs` - EXCEPT the first real
 * (non-zero) value, which applies at once so the initial render isn't delayed. The reader renders
 * page canvases at the settled width and CSS-zooms the live delta, so a rapid wheel-zoom scales
 * instantly (cheap) and re-rasterizes just once when it stops.
 */
export function useSettledWidth(width: number, delayMs: number): number {
   const [settled, setSettled] = useState(width);
   const seededOnce = useRef(false);

   useEffect(() => {
      // The first real (non-zero) width lands at once (no initial-render delay); later changes debounce.
      const immediate = !seededOnce.current && width > 0;
      if (immediate) seededOnce.current = true;
      const id = setTimeout(() => setSettled(width), immediate ? 0 : delayMs);
      return () => clearTimeout(id);
   }, [width, delayMs]);

   return settled;
}
