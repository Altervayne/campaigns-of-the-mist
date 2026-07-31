// -- React Imports --
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

// -- Animation Imports --
import { animate, motion, useMotionValue } from 'framer-motion';

// -- Component Imports --
import { MobileSheetCardSlot } from '@/components/mobile/character-sheet/MobileSheetCardSlot';

// -- Hook Imports --
import { useMobileSheetPagerGesture } from '@/hooks/mobile/useMobileSheetPagerGesture';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { resolvePageTrackOffset } from '@/lib/mobile/mobileSheetPagerMath';

// -- Type Imports --
import type { ResolvedSheetItem } from '@/lib/character/sheetLayout';



// The settle spring, shared by finger-release and control-tap jumps so a tap animates like a swipe.
const PAGER_SPRING = { type: 'spring' as const, stiffness: 300, damping: 30 };

interface MobileSheetPagerProps {
   /** Page 0: the vertically-scrolling trackers surface, hosted as-is. */
   trackersSurface: ReactNode;
   /** Pages 1..N: cards + journals in manifest order. Empty renders a single add-card placeholder page. */
   items: ResolvedSheetItem[];
   /** The settled page (0 = trackers, k = item k-1), derived by the host from tab + card state. */
   committedPage: number;
   /** Reports the settled page after a finger-release so the host maps it to tab/card state and history. */
   onCommit: (page: number) => void;
   /** The active page owns its horizontal drags (an editable journal); the pager drag stands down. */
   suppressDrag: boolean;
   isLeftHanded: boolean;
   isMobileFABMode: boolean;
   isToolbeltOpen: boolean;
   isEditing: boolean;
   onOpenToolbelt: () => void;
   onOpenAddCard?: () => void;
}

/**
 * The mobile character sheet's horizontal navigation as one continuous finger-tracking pager. Pages are
 * `[trackers, ...items]`; the track's `translateX` follows the finger 1:1 and springs to the nearest page
 * on release (honoring flick velocity), and the tab bar / nav bar jump into the same track by moving
 * `committedPage`. Only `committedPage ± 1` mount (cards are heavy); slots sit at their true page offset via
 * `left: page * 100%`, so the sparse window still positions correctly.
 *
 * State of record is the host's tab + card index; this owns only the visual track offset. A single
 * `pageRef` reconciles the two animation paths - a finger-release animates and commits (host state then
 * matches, so the external effect skips), while a control tap changes `committedPage` and the effect
 * animates - so neither double-springs.
 */
export function MobileSheetPager({
   trackersSurface,
   items,
   committedPage,
   onCommit,
   suppressDrag,
   isLeftHanded,
   isMobileFABMode,
   isToolbeltOpen,
   isEditing,
   onOpenToolbelt,
   onOpenAddCard,
}: MobileSheetPagerProps) {
   // At least one card page exists even with no items: it hosts the add-card placeholder.
   const lastPage = Math.max(1, items.length);

   const x = useMotionValue(0);
   const containerRef = useRef<HTMLDivElement>(null);
   const widthRef = useRef(0);
   const [width, setWidth] = useState(0);
   const pageRef = useRef(committedPage);

   // The single settle path: park at a page, animated (tap/release) or instant (mount/resize). Width is read
   // LIVE from the container (falling back to the cached measure) so a jump never resolves against a stale or
   // not-yet-measured width; if neither is known the settle defers without advancing `pageRef`, so the
   // width-effect re-runs it once a width is known - the fix for the track lagging a page behind on jumps.
   const settleToPage = (page: number, withAnimation: boolean) => {
      const target = resolvePageTrackOffset({ page, liveWidth: containerRef.current?.clientWidth ?? 0, fallbackWidth: widthRef.current });
      if (target === null) return;
      pageRef.current = page;
      if (withAnimation) animate(x, target, PAGER_SPRING);
      else x.set(target);
   };

   // Measure the page pitch and keep the track aligned on mount and across resize/rotation.
   useLayoutEffect(() => {
      const element = containerRef.current;
      if (!element) return;
      const measure = () => {
         const next = element.clientWidth;
         if (!next) return;
         widthRef.current = next;
         setWidth(next);
         x.set(-pageRef.current * next);
      };
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => observer.disconnect();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time bind; measure reads live refs.
   }, []);

   // External jumps (tab bar, nav-bar arrows/dots, initial-item mount): animate to the new committed page. A
   // finger-release already parked `pageRef` at its target, so this skips that self-caused change. `width` is
   // a dependency so a jump that arrived before the pitch was known re-settles the instant it is measured.
   useEffect(() => {
      if (pageRef.current === committedPage) return;
      settleToPage(committedPage, true);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- settleToPage reads live width; only page/width changes should re-run.
   }, [committedPage, width]);

   const setTrackNode = useMobileSheetPagerGesture({
      x,
      width,
      lastPage,
      suppress: suppressDrag,
      canToolbeltEdge: !isMobileFABMode && !isToolbeltOpen,
      isLeftHanded,
      onOpenToolbelt,
      animateToPage: (page) => settleToPage(page, true),
      onCommit,
   });

   const windowStart = Math.max(0, committedPage - 1);
   const windowEnd = Math.min(lastPage, committedPage + 1);
   const windowPages: number[] = [];
   for (let page = windowStart; page <= windowEnd; page++) windowPages.push(page);

   return (
      <div ref={containerRef} className="relative flex-1 min-h-0 w-full overflow-hidden" data-tutorial="card-carousel">
         <motion.div
            ref={setTrackNode}
            style={{ x }}
            // pan-y lets the browser own vertical scroll inside a page; horizontal is the pager's. An
            // editable journal page yields entirely (auto), so its body keeps native caret/selection.
            className={cn('absolute inset-0', suppressDrag ? 'touch-auto' : 'touch-pan-y')}
         >
            {windowPages.map((page) => (
               <div key={`page-${page}`} className="absolute inset-y-0 w-full" style={{ left: `${page * 100}%` }}>
                  {page === 0
                     ? trackersSurface
                     : <MobileSheetCardSlot item={items[page - 1]} isLeftHanded={isLeftHanded} isEditing={isEditing} onOpenAddCard={onOpenAddCard} />}
               </div>
            ))}
         </motion.div>
      </div>
   );
}
