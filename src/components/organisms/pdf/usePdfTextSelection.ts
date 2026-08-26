// -- React Imports --
import { useEffect, useRef, useState } from 'react';

// -- Type Imports --
import type { RefObject } from 'react';

/*
 * Tracks the live text selection inside the reader's scroller. It watches document selection changes
 * (coalesced to a frame) and reports the current selection's viewport rect + text while the selection
 * is non-collapsed and anchored inside `scrollRef`; otherwise null. It clears on collapse, on scroll
 * (the rect goes stale), and whenever it's turned off (markup mode), so the Copy bar only ever tracks a
 * real read-mode selection over the pages - never a stray selection in the chrome or a side panel.
 */

export interface PdfTextSelection {
   /** The selection's bounding rect in viewport coordinates. */
   rect: DOMRect;
   /** The selected plain text. */
   text: string;
}

export function usePdfTextSelection(scrollRef: RefObject<HTMLElement | null>, active: boolean): PdfTextSelection | null {
   const [selection, setSelection] = useState<PdfTextSelection | null>(null);
   const frame = useRef<number | null>(null);

   useEffect(() => {
      if (!active) return;
      const scroller = scrollRef.current;
      if (!scroller) return;

      const read = (): PdfTextSelection | null => {
         const sel = window.getSelection();
         if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
         const anchor = sel.anchorNode;
         if (!anchor || !scroller.contains(anchor)) return null;
         const text = sel.toString();
         if (!text.trim()) return null;
         const rect = sel.getRangeAt(0).getBoundingClientRect();
         if (rect.width === 0 && rect.height === 0) return null;
         return { rect, text };
      };

      const schedule = () => {
         if (frame.current !== null) return;
         frame.current = window.requestAnimationFrame(() => {
            frame.current = null;
            setSelection(read());
         });
      };

      // A stale rect while scrolling is worse than none, so hide the bar until the selection next changes.
      const clear = () => setSelection(null);

      document.addEventListener('selectionchange', schedule);
      scroller.addEventListener('scroll', clear, { passive: true });
      // Seed once in case a selection already stands when this activates.
      schedule();

      return () => {
         if (frame.current !== null) {
            cancelAnimationFrame(frame.current);
            frame.current = null;
         }
         document.removeEventListener('selectionchange', schedule);
         scroller.removeEventListener('scroll', clear);
         // Drop any tracked selection when tracking stops (markup toggled on, or unmount), so it never
         // resurfaces stale on the next read-mode pass.
         setSelection(null);
      };
   }, [scrollRef, active]);

   // Never surface a selection while inactive, even for the frame before the effect's cleanup clears it.
   return active ? selection : null;
}
