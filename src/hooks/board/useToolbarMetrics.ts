// -- React Imports --
import { useCallback, useRef, useState } from 'react';

/** A floating board toolbar's live geometry, in the two units the off-edge clamp needs. */
export interface ToolbarMetrics {
   /** The bar's rendered width in SCREEN px: it counter-scales by 1/zoom, so its layout width is what shows. */
   screenWidth: number;
   /** WORLD-px from the host box's left edge to the bar's anchor; a centred bar resolves to half the box. */
   anchorOffset: number;
}

const UNMEASURED: ToolbarMetrics = { screenWidth: 0, anchorOffset: 0 };

/**
 * Measures a floating toolbar for the off-edge clamp. Both values change only when the bar's own contents
 * do (its per-kind action slot) or when the host box resizes, so they come from a ResizeObserver and never
 * from the pan path - a layout read per frame would thrash while panning. Put `measureRef` on the bar's
 * positioned root, whose offsetParent is the host box.
 *
 * `offsetWidth`/`offsetLeft` are layout metrics, so the world layer's scale never enters them: the width
 * is the bar's own (which its counter-scale renders at that many screen px), and the offset is world units.
 * Reading the offset off the DOM also means the anchor follows the width the box actually RENDERS at - a
 * collapsed zone's bar, an expanded card's sheet - rather than its stored width.
 */
export function useToolbarMetrics(): { metrics: ToolbarMetrics; measureRef: (node: HTMLElement | null) => void } {
   const [metrics, setMetrics] = useState<ToolbarMetrics>(UNMEASURED);
   const observerRef = useRef<ResizeObserver | null>(null);

   const measureRef = useCallback((node: HTMLElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!node) return;
      // Bail on an unchanged read so a resize elsewhere can't churn the clamp (and with it the bar's host).
      const read = () =>
         setMetrics((prev) =>
            prev.screenWidth === node.offsetWidth && prev.anchorOffset === node.offsetLeft
               ? prev
               : { screenWidth: node.offsetWidth, anchorOffset: node.offsetLeft },
         );
      const observer = new ResizeObserver(read);
      // The observer fires on observe(), so the first measure lands without a read in the ref callback.
      observer.observe(node);
      // The anchor offset resolves against the host box, which resizes independently of the bar.
      if (node.offsetParent instanceof Element) observer.observe(node.offsetParent);
      observerRef.current = observer;
   }, []);

   return { metrics, measureRef };
}
