// -- React Imports --
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/*
 * Viewport tracking for the virtualized page list. Two IntersectionObservers keyed off the scroll
 * container: a RENDER observer with a generous vertical margin decides which pages get their canvas
 * mounted (so a page paints just before it scrolls in and unmounts once well past), and a CURRENT
 * observer with tight bounds picks the page most in view to drive the indicator. Elements register
 * through a ref callback, so a page box observed whether it mounts before or after the observers.
 */

/** How far beyond the viewport (top and bottom) a page is still mounted, in px. */
const RENDER_MARGIN_PX = 1200;

/** The value a page box carries so an IntersectionObserver entry maps back to a page number. */
const PAGE_ATTR = 'data-page';

interface VisiblePages {
   /** Page numbers whose canvas should be mounted (near or in the viewport). */
   visible: Set<number>;
   /** Ref callback a page box registers with, so both observers track it. */
   registerPage: (pageNumber: number, el: HTMLElement | null) => void;
}

/**
 * @param rootRef - The scroll container the pages live in.
 * @param pageCount - Total pages; re-arms the observers when the document changes.
 * @param onCurrentPage - Called with the page most in view whenever it changes.
 * @param initialPage - The page to seed as visible, so a restored reading position renders THAT page first,
 *   before the observer adds its off-screen neighbours - what the reader is looking at paints soonest.
 */
export function useVisiblePages(
   rootRef: RefObject<HTMLElement | null>,
   pageCount: number,
   onCurrentPage: (page: number) => void,
   initialPage = 1,
): VisiblePages {
   const [visible, setVisible] = useState<Set<number>>(() => new Set([Math.min(Math.max(initialPage, 1), pageCount)]));
   const elements = useRef(new Map<number, HTMLElement>());
   const ratios = useRef(new Map<number, number>());
   const currentPage = useRef(1);
   const renderObserver = useRef<IntersectionObserver | null>(null);
   const currentObserver = useRef<IntersectionObserver | null>(null);

   const pageOf = (target: Element): number => Number(target.getAttribute(PAGE_ATTR));

   useEffect(() => {
      const root = rootRef.current;
      if (!root) return;

      const renderObs = new IntersectionObserver(
         (entries) => {
            setVisible((prev) => {
               const next = new Set(prev);
               for (const entry of entries) {
                  const page = pageOf(entry.target);
                  if (entry.isIntersecting) next.add(page);
                  else next.delete(page);
               }
               return next;
            });
         },
         { root, rootMargin: `${RENDER_MARGIN_PX}px 0px` },
      );

      const currentObs = new IntersectionObserver(
         (entries) => {
            for (const entry of entries) {
               ratios.current.set(pageOf(entry.target), entry.isIntersecting ? entry.intersectionRatio : 0);
            }
            let best = currentPage.current;
            let bestRatio = -1;
            for (const [page, ratio] of ratios.current) {
               if (ratio > bestRatio) {
                  bestRatio = ratio;
                  best = page;
               }
            }
            if (best !== currentPage.current) {
               currentPage.current = best;
               onCurrentPage(best);
            }
         },
         { root, threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
      );

      renderObserver.current = renderObs;
      currentObserver.current = currentObs;
      for (const el of elements.current.values()) {
         renderObs.observe(el);
         currentObs.observe(el);
      }

      return () => {
         renderObs.disconnect();
         currentObs.disconnect();
         renderObserver.current = null;
         currentObserver.current = null;
      };
   }, [rootRef, pageCount, onCurrentPage]);

   const registerPage = useCallback((pageNumber: number, el: HTMLElement | null) => {
      const previous = elements.current.get(pageNumber);
      if (previous && previous !== el) {
         renderObserver.current?.unobserve(previous);
         currentObserver.current?.unobserve(previous);
      }
      if (el) {
         elements.current.set(pageNumber, el);
         renderObserver.current?.observe(el);
         currentObserver.current?.observe(el);
      } else {
         elements.current.delete(pageNumber);
         ratios.current.delete(pageNumber);
      }
   }, []);

   return { visible, registerPage };
}
