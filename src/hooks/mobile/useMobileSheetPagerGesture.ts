// -- React Imports --
import { useCallback, useEffect, useRef } from 'react';

// -- Animation Imports --
import type { MotionValue } from 'framer-motion';

// -- Store Imports --
import { getActiveSheetZoom } from '@/lib/character/tabManagerStore';

// -- Utils Imports --
import {
   isHorizontalPagerDrag,
   isVerticalPagerDrag,
   resolvePagerDragOffset,
   resolvePagerSettle,
} from '@/lib/mobile/mobileSheetPagerMath';



// Leading-edge width (px) reserved for the toolbelt edge-swipe on the trackers page (side-panel mode).
const EDGE_TOOLBELT_ZONE = 50;
// Minimum horizontal travel (px) that confirms a toolbelt edge-swipe on release.
const EDGE_TOOLBELT_CONFIRM = 30;

interface PagerGestureConfig {
   /** The finger-tracked track offset (px), shared with the host's spring-settle animations. */
   x: MotionValue<number>;
   /** Live track width (px); the page pitch. */
   width: number;
   /** Highest valid page index. */
   lastPage: number;
   /** The active page owns its horizontal drags (an editable journal body); the pager stands down. */
   suppress: boolean;
   /** Side-panel toolbelt edge-swipe is available (side-panel mode, closed toolbelt). */
   canToolbeltEdge: boolean;
   /** Toolbelt docks on the leading edge: left when true, right otherwise. */
   isLeftHanded: boolean;
   /** Opens the toolbelt (edge-swipe confirmed). */
   onOpenToolbelt: () => void;
   /** Springs the track to a page and records it as the target (shared with external jumps). */
   animateToPage: (page: number) => void;
   /** Reports the settled page to the host, which maps it to tab/card state and history. */
   onCommit: (page: number) => void;
}

type GestureMode = 'idle' | 'pending' | 'horizontal' | 'vertical' | 'suppressed' | 'edge';

interface GestureState {
   startX: number;
   startY: number;
   startTime: number;
   baseX: number;
   startPage: number;
   zoom: number;
   startedInEdge: boolean;
   mode: GestureMode;
}

// Toolbelt-open direction: from the left edge swipe right (left-handed), from the right edge swipe left.
const opensToolbelt = (deltaX: number, isLeftHanded: boolean): boolean => (isLeftHanded ? deltaX > 0 : deltaX < 0);

/**
 * Binds the mobile sheet pager's continuous finger-tracking to a track element. A `touch-action: pan-y`
 * track lets the browser own vertical scroll; this claims a gesture only once it is clearly horizontal
 * (the shared dominance gate), then tracks the finger 1:1 on `config.x` and, on release, springs to the
 * nearest page honoring flick velocity.
 *
 * The gate also routes the two carve-outs the old threshold stepping owned: an editable journal page
 * suppresses the drag (its body owns horizontal travel; the nav-bar arrows still step), and a horizontal
 * swipe starting in the reserved leading-edge zone on the trackers page opens the toolbelt instead of
 * paging. Drag deltas are divided by the active sheet zoom so tracking stays 1:1 under a scaled sheet.
 *
 * `touchmove` is attached non-passively so an engaged horizontal drag can `preventDefault` and lock the
 * axis (stopping the inner scroller from also panning); `touchstart`/`touchend` stay passive. Listeners
 * bind once to the node and read live inputs through a config ref.
 *
 * @returns A ref-setter for the track element.
 */
export function useMobileSheetPagerGesture(config: PagerGestureConfig) {
   // Latest inputs for the once-bound native listeners to read; the handlers only fire post-interaction.
   const configRef = useRef(config);
   useEffect(() => { configRef.current = config; });

   const nodeRef = useRef<HTMLElement | null>(null);
   const gestureRef = useRef<GestureState>({ startX: 0, startY: 0, startTime: 0, baseX: 0, startPage: 0, zoom: 1, startedInEdge: false, mode: 'idle' });

   useEffect(() => {
      const node = nodeRef.current;
      if (!node) return;

      const clampPage = (page: number) => Math.max(0, Math.min(configRef.current.lastPage, page));

      const onTouchStart = (event: TouchEvent) => {
         const { x, width } = configRef.current;
         // Stand down when the touch starts on a surface that owns its own drag (a trackers reorder grip):
         // its dnd handlers run on document listeners this native handler can't be stopped by.
         const target = event.target as Element | null;
         if (!width || event.touches.length !== 1 || target?.closest('[data-sheet-pager-ignore]')) {
            gestureRef.current.mode = 'idle';
            return;
         }
         x.stop();
         const touch = event.touches[0];
         const baseX = x.get();
         const startPage = clampPage(Math.round(-baseX / width));
         const { canToolbeltEdge, isLeftHanded } = configRef.current;
         const startedInEdge = canToolbeltEdge && startPage === 0 && (isLeftHanded
            ? touch.clientX < EDGE_TOOLBELT_ZONE
            : touch.clientX > window.innerWidth - EDGE_TOOLBELT_ZONE);

         gestureRef.current = {
            startX: touch.clientX,
            startY: touch.clientY,
            startTime: performance.now(),
            baseX,
            startPage,
            zoom: getActiveSheetZoom() || 1,
            startedInEdge,
            mode: 'pending',
         };
      };

      const onTouchMove = (event: TouchEvent) => {
         const state = gestureRef.current;
         if (state.mode !== 'pending' && state.mode !== 'horizontal') return;

         const { x, width, suppress, isLeftHanded, lastPage } = configRef.current;
         if (!width) return;

         const touch = event.touches[0];
         const deltaX = (touch.clientX - state.startX) / state.zoom;
         const deltaY = (touch.clientY - state.startY) / state.zoom;

         if (state.mode === 'pending') {
            if (isVerticalPagerDrag(deltaX, deltaY)) { state.mode = 'vertical'; return; }
            if (!isHorizontalPagerDrag(deltaX, deltaY)) return;
            if (suppress) { state.mode = 'suppressed'; return; }
            if (state.startedInEdge && opensToolbelt(deltaX, isLeftHanded)) { state.mode = 'edge'; return; }
            state.mode = 'horizontal';
         }

         // Engaged horizontal drag: lock the axis and track the finger.
         event.preventDefault();
         x.set(resolvePagerDragOffset({ baseX: state.baseX, deltaX, startPage: state.startPage, lastPage }));
      };

      const onTouchEnd = (event: TouchEvent) => {
         const state = gestureRef.current;

         if (state.mode === 'edge') {
            const endDeltaX = (event.changedTouches[0].clientX - state.startX) / state.zoom;
            if (opensToolbelt(endDeltaX, configRef.current.isLeftHanded) && Math.abs(endDeltaX) >= EDGE_TOOLBELT_CONFIRM) {
               configRef.current.onOpenToolbelt();
            }
         } else if (state.mode === 'horizontal') {
            const deltaX = (event.changedTouches[0].clientX - state.startX) / state.zoom;
            const elapsed = performance.now() - state.startTime;
            const velocity = elapsed > 0 ? deltaX / elapsed : 0;
            const target = resolvePagerSettle({ currentPage: state.startPage, deltaX, velocity, lastPage: configRef.current.lastPage });
            configRef.current.animateToPage(target);
            configRef.current.onCommit(target);
         }

         state.mode = 'idle';
      };

      node.addEventListener('touchstart', onTouchStart, { passive: true });
      node.addEventListener('touchmove', onTouchMove, { passive: false });
      node.addEventListener('touchend', onTouchEnd, { passive: true });
      node.addEventListener('touchcancel', onTouchEnd, { passive: true });

      return () => {
         node.removeEventListener('touchstart', onTouchStart);
         node.removeEventListener('touchmove', onTouchMove);
         node.removeEventListener('touchend', onTouchEnd);
         node.removeEventListener('touchcancel', onTouchEnd);
      };
   }, []);

   return useCallback((node: HTMLElement | null) => {
      nodeRef.current = node;
   }, []);
}
