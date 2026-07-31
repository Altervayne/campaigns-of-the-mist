// -- React Imports --
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { AnimatePresence, motion } from 'framer-motion';

// -- Icon Imports --
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Component Imports --
import { Tab } from './Tab';
import { NewTabDialog } from '@/components/organisms/dialogs/NewTabDialog';

// -- Store Imports --
import { useTabManagerStore } from '@/lib/character/tabManagerStore';

// -- Type Imports --
import type { DrawerItem } from '@/lib/types/drawer';

/**
 * Desktop multi-character tab strip: a top bar over the character area, to the right of
 * the SidebarMenu. Renders the open tabs in order, with a `+` that opens the
 * {@link NewTabDialog} right after the last tab.
 *
 * Layout: `[ < ] [ scroll container: tabs ... + ] [ > ]`. The tabs (and the trailing `+`)
 * live in a dedicated `min-w-0 flex-1` scroll container so the strip is capped to the
 * play-area width (between the sidebar and the drawer) and SCROLLS rather than pushing
 * them off-screen. The chevrons flank the container, appear only when the tabs overflow,
 * and disable at each end; the mouse wheel scrolls horizontally. The bordered OUTER strip
 * stays the drop target (`tab-strip-drop-zone`, `data-tab-strip`): the generous
 * tab-lane geometry test reads its rect, so the marker must stay on the full strip.
 *
 * The tab `SortableContext` is registered inside the **sheet's** `DndContext`
 * (`WorkspacePage`), not its own; the strip mounts within that subtree, so the
 * tabs reorder through the sheet's shared sensors, collision detection, drag overlay,
 * and `handleDragEnd` (which routes a `'tab'` drag to `reorderTabs`). Sharing one
 * context is what lets a tab drag later cross between the strip and the drawer.
 *
 * At zero open tabs the strip shows just the `+` and the area below renders the
 * MainMenu. Mobile does not render this strip (it stays single-character).
 *
 * @param props.forceDropHighlight - When set, forces the drop highlight on (the sheet's
 *   generous tab-lane test is more forgiving than the thin droppable and supersedes it).
 *   Falls back to @dnd-kit's own `isOver` test.
 */
export function TabStrip({ forceDropHighlight = false }: { forceDropHighlight?: boolean }) {
   const { t } = useTranslation();
   const openTabs = useTabManagerStore((state) => state.openTabs);
   const activeTabId = useTabManagerStore((state) => state.activeTabId);
   const [isNewTabDialogOpen, setIsNewTabDialogOpen] = useState(false);

   // Drop target for dragging a FULL_CHARACTER_SHEET drawer item onto the strip to
   // open/focus it as a tab. Highlight only while a character item hovers (a
   // non-character item is a no-op and must not read as droppable).
   const { setNodeRef, isOver, active } = useDroppable({ id: 'tab-strip-drop-zone', data: { type: 'tab-strip' } });
   const activeIsCharacterItem =
      active?.data.current?.type === 'drawer-item' &&
      (active.data.current.item as DrawerItem | undefined)?.type === 'FULL_CHARACTER_SHEET';
   const showDropHighlight = forceDropHighlight || (isOver && Boolean(activeIsCharacterItem));

   // ==================
   //  Overflow scroll UX
   // ==================
   const scrollRef = useRef<HTMLDivElement>(null);
   const [canScrollLeft, setCanScrollLeft] = useState(false);
   const [canScrollRight, setCanScrollRight] = useState(false);

   /**
    * Recomputes whether the tabs overflow to the left/right of the scroll container, to
    * drive the chevrons. Cheap; called on scroll, on resize (ResizeObserver), and when
    * the tab set changes, so the arrows track the drawer opening, the window resizing,
    * and tabs being added/removed.
    */
   const updateScrollAffordances = useCallback(() => {
      const el = scrollRef.current;
      if (!el) return;
      const { scrollLeft, scrollWidth, clientWidth } = el;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(Math.ceil(scrollLeft + clientWidth) < scrollWidth); // ceil: ignore sub-pixel rounding
   }, []);

   // Track the scroll position + container/content size so the chevrons stay correct
   // across scrolling, resizes, and drawer open/close. The wheel listener is attached
   // natively (not via onWheel) so it can `preventDefault`; React's synthetic wheel
   // handler is passive, where preventDefault is a no-op.
   useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;

      updateScrollAffordances();

      const onWheel = (event: WheelEvent) => {
         if (el.scrollWidth <= el.clientWidth) return; // no overflow -> leave page scroll alone
         el.scrollLeft += event.deltaY;
         event.preventDefault();
      };

      el.addEventListener('scroll', updateScrollAffordances, { passive: true });
      el.addEventListener('wheel', onWheel, { passive: false });
      const resizeObserver = new ResizeObserver(updateScrollAffordances);
      resizeObserver.observe(el);

      return () => {
         el.removeEventListener('scroll', updateScrollAffordances);
         el.removeEventListener('wheel', onWheel);
         resizeObserver.disconnect();
      };
   }, [updateScrollAffordances]);

   // Recompute when the tab set changes (add / remove / reorder). A reorder runs a drag,
   // whose auto-scroll can nudge the container down its 1px vertical scroll range (the
   // active tab's 1px bottom overlap, exposed because `overflow-x-auto` also makes y
   // scrollable), leaving the tabs shifted up by 1px. Pin `scrollTop` back to 0.
   useEffect(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      updateScrollAffordances();
   }, [openTabs, updateScrollAffordances]);

   /** Scrolls the tabs container toward one side by ~80% of its visible width. */
   const scrollByDirection = useCallback((direction: -1 | 1) => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
   }, []);

   // Square, translucent, frosted button OVERLAID on the scroll edge so the tabs scroll
   // underneath it rather than the arrow taking its own slot. Centered vertically via
   // `top-0 bottom-0 my-auto` (NOT a transform) so framer-motion can own `x` for the
   // slide-in/out without a transform conflict. Shown per-side only when that direction
   // can scroll; on unmount it slides off its own edge (the strip's `overflow-x-clip`
   // clips it cleanly so it never pokes over the sidebar).
   const arrowClass =
      'absolute top-0 bottom-0 z-20 my-auto flex size-8 items-center justify-center rounded-md shadow-[3px_3px_10px_3px_#00000075] bg-primary/70 backdrop-blur-sm text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground cursor-pointer';

   return (
      <div
         ref={setNodeRef}
         data-tab-strip
         data-tutorial="tab-strip"
         className={cn(
            // Inset, recessed strip: the active tab below overlaps this single bottom
            // border to merge with the sheet. The outer strip is NOT the scroll
            // container (the inner one is); it stays the full-width drop target whose
            // rect the tab-lane geometry test reads.
            // `overflow-x-clip` clips a slide-out arrow at the strip edge (so it never
            // pokes over the sidebar) without clipping the active tab's 1px bottom overlap:
            // `clip` on x leaves y `visible` (unlike `hidden`, which would force y to auto).
            'relative flex shrink-0 items-end gap-1 pt-1 overflow-x-clip border-b border-border bg-card',
            showDropHighlight && 'ring-2 ring-inset ring-primary bg-primary/10',
         )}
      >
         <AnimatePresence>
            {canScrollLeft && (
               <motion.button
                  key="scroll-left"
                  type="button"
                  onClick={() => scrollByDirection(-1)}
                  aria-label={t('Tabs.scrollLeft')}
                  title={t('Tabs.scrollLeft')}
                  className={cn(arrowClass, 'left-2.5')}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
               >
                  <ChevronLeft className="h-4 w-4" />
               </motion.button>
            )}
         </AnimatePresence>

         {/* Scroll container: the only horizontally-scrollable element. `min-w-0 flex-1`
             lets it shrink to the capped strip width so it scrolls instead of growing.
             `scrollbar-hide` hides the bar; it also removes the need for an explicit
             `overflow-y-hidden` (which would clip the active tab's 1px bottom overlap now
             that the border lives on the outer strip); the wheel handler maps vertical
             wheel to horizontal scroll, so there is no vertical scrolling to show. */}
         <div
            ref={scrollRef}
            className="min-w-0 h-12 flex-1 flex items-end gap-1.5 overflow-y-hide overflow-x-auto overscroll-x-contain scrollbar-hide"
         >
            <SortableContext items={openTabs.map((tab) => tab.id)} strategy={horizontalListSortingStrategy}>
               <div className="flex items-end">
                  {openTabs.map((tab) => (
                     <Tab key={tab.id} tab={tab} isActive={tab.id === activeTabId} />
                  ))}
               </div>
            </SortableContext>

            {/* New-tab button sits right after the last tab and scrolls with them. */}
            <button
               type="button"
               data-tutorial="tab-new"
               onClick={() => setIsNewTabDialogOpen(true)}
               aria-label={t('Tabs.newTab')}
               title={t('Tabs.newTab')}
               className="shrink-0 mb-2 ml-1 mr-1.5 flex items-center justify-center rounded-md px-2 py-2 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
            >
               <Plus className="h-4 w-4" />
            </button>
         </div>

         <AnimatePresence>
            {canScrollRight && (
               <motion.button
                  key="scroll-right"
                  type="button"
                  onClick={() => scrollByDirection(1)}
                  aria-label={t('Tabs.scrollRight')}
                  title={t('Tabs.scrollRight')}
                  className={cn(arrowClass, 'right-2.5')}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
               >
                  <ChevronRight className="h-4 w-4" />
               </motion.button>
            )}
         </AnimatePresence>

         <NewTabDialog isOpen={isNewTabDialogOpen} onOpenChange={setIsNewTabDialogOpen} />
      </div>
   );
}
