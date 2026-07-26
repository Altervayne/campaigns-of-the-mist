// -- React Imports --
import { useCallback, useEffect, useRef, useState } from 'react';

// -- Type Imports --
import type { ActiveTool } from '@/lib/types/board';

/*
 * The bottom-bar overflow-scroll UX (mirrors the tab strip: wheel scrolls, hidden scrollbar, edge
 * arrows). Owns the scroll/content refs, the overflow flags, and the wheel/scroll/resize listeners.
 * Takes `activeTool` so the arrows recompute when the contextual section swaps width.
 */
export function useBoardBarScroll(activeTool: ActiveTool) {
   const barScrollRef = useRef<HTMLDivElement | null>(null);
   const barContentRef = useRef<HTMLDivElement | null>(null);
   const [barCanScrollLeft, setBarCanScrollLeft] = useState(false);
   const [barCanScrollRight, setBarCanScrollRight] = useState(false);

   /** Recomputes whether the bar overflows left/right, to drive the edge arrows. */
   const updateBarScroll = useCallback(() => {
      const el = barScrollRef.current;
      if (!el) return;
      const { scrollLeft, scrollWidth, clientWidth } = el;
      setBarCanScrollLeft(scrollLeft > 0);
      setBarCanScrollRight(Math.ceil(scrollLeft + clientWidth) < scrollWidth); // ceil: ignore sub-pixel rounding
   }, []);

   // A vertical wheel scrolls the bar horizontally (only when it overflows, so the page/canvas keeps
   // its wheel otherwise). Native listener so it can preventDefault (React's onWheel is passive). The
   // arrows track scrolling, the bar resizing, and the title/content growing (observe both elements).
   useEffect(() => {
      const el = barScrollRef.current;
      if (!el) return;
      updateBarScroll();
      const onWheel = (event: WheelEvent) => {
         // The bar consumes the wheel (never lets it reach the canvas zoom), and scrolls itself
         // horizontally when it overflows.
         event.stopPropagation();
         if (el.scrollWidth <= el.clientWidth) return;
         el.scrollLeft += event.deltaY;
         event.preventDefault();
      };
      el.addEventListener('scroll', updateBarScroll, { passive: true });
      el.addEventListener('wheel', onWheel, { passive: false });
      const observer = new ResizeObserver(updateBarScroll);
      observer.observe(el);
      if (barContentRef.current) observer.observe(barContentRef.current);
      return () => {
         el.removeEventListener('scroll', updateBarScroll);
         el.removeEventListener('wheel', onWheel);
         observer.disconnect();
      };
   }, [updateBarScroll]);

   // The bar's contextual section swaps with the tool (creation cluster vs. drawing settings), changing its
   // width; recompute the overflow arrows once the swap has laid out.
   useEffect(() => { updateBarScroll(); }, [activeTool, updateBarScroll]);

   /** Scrolls the bar toward one side by ~80% of its visible width. */
   const scrollBarBy = useCallback((direction: -1 | 1) => {
      const el = barScrollRef.current;
      if (el) el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
   }, []);

   return { barScrollRef, barContentRef, barCanScrollLeft, barCanScrollRight, scrollBarBy };
}
