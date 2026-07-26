// -- React Imports --
import { useCallback, useEffect, useRef, useState } from 'react';

// -- Other Library Imports --
import { useStore } from 'zustand';

// -- Utils Imports --
import { centerViewport, fitViewport, screenToWorld, zoomToCursor } from '@/lib/board/boardCoordinates';

// -- Type Imports --
import type { BoardState, BoardStore } from '@/lib/stores/boardStore';
import type { Viewport } from '@/lib/types/board';
import type { Point } from '@/lib/board/boardConnections';

/** Wheel-to-zoom sensitivity: a typical notch (~100 deltaY) is a gentle step. */
const ZOOM_SENSITIVITY = 0.0015;

/** Screen-px margin fit-to-content leaves around the framed items. */
export const FIT_PADDING = 64;

/*
 * The board camera: owns the viewport subscription + its ref mirror, the clip element ref and its live
 * box, the pan gesture, wheel zoom-to-cursor, and the world-coordinate + view-center helpers every other
 * board gesture reads. The clip ref is returned plain so the component composes it with the dnd-kit
 * droppable node ref.
 */
export function useBoardViewport(store: BoardStore, actions: BoardState['actions'], items: BoardState['items']) {
   const viewport = useStore(store, (state) => state.viewport);

   const clipRef = useRef<HTMLDivElement | null>(null);
   // Mirror the live viewport into a ref so the native wheel listener and pan handlers
   // read the current value without re-subscribing.
   const viewportRef = useRef(viewport);
   useEffect(() => {
      viewportRef.current = viewport;
   }, [viewport]);
   const panStart = useRef<{ x: number; y: number; origX: number; origY: number; zoom: number } | null>(null);
   const [isPanning, setIsPanning] = useState(false);

   // The clip's live box (size + viewport offset), so the corner readout and the card popover read it
   // from state, never via the ref during render. The observer captures the rect (in its callback, not
   // the effect body) and fires on observe(), so the first measure lands without a synchronous setState.
   const [clipRect, setClipRect] = useState({ left: 0, top: 0, width: 0, height: 0 });
   useEffect(() => {
      const el = clipRef.current;
      if (!el) return;
      const observer = new ResizeObserver(() => {
         const box = el.getBoundingClientRect();
         setClipRect({ left: box.left, top: box.top, width: box.width, height: box.height });
      });
      observer.observe(el);
      return () => observer.disconnect();
   }, []);

   // The positioning cluster's X input, focused by the palette's jump command (it can't carry a coordinate
   // through the one-shot bridge, so it focuses the field and lets the user type).
   const jumpXRef = useRef<HTMLInputElement | null>(null);

   // The world point at the clip's center, for the positioning cluster. Origin cancels for the centre, so
   // it derives from the live viewport + clip size alone (no layout read during render).
   const viewCenter = screenToWorld(clipRect.width / 2, clipRect.height / 2, { left: 0, top: 0 }, viewport);
   // Reset-view places the world origin at the clip's center (so the cluster reads 0, 0), not the
   // top-left corner that a zero offset would give.
   const originViewport = (): Viewport => centerViewport({ x: 0, y: 0 }, clipRect, 1);
   // Recenters the viewport on a world point (keeping zoom): the coordinate cluster's jump. Same centering
   // as fit-to-content / reset-view; routed through the debounced, non-undoable camera setter.
   const jumpToViewCenter = (world: Point) => actions.setViewport(centerViewport(world, clipRect, viewport.zoom));

   /** Converts an absolute cursor point to world coords via the live clip rect + viewport. */
   const cursorToWorld = useCallback((clientX: number, clientY: number): Point | null => {
      const el = clipRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return screenToWorld(clientX, clientY, { left: rect.left, top: rect.top }, viewportRef.current);
   }, []);

   // ==================
   //  Zoom (native, non-passive wheel so it can preventDefault the page scroll)
   // ==================
   useEffect(() => {
      const el = clipRef.current;
      if (!el) return;
      const onWheel = (event: WheelEvent) => {
         // A selected, scrollable note (post-it/journal) marks its body for native scroll: let the wheel
         // scroll it instead of zooming the board - no preventDefault, so the textarea scrolls natively.
         const target = event.target;
         if (target instanceof Element && target.closest('[data-board-wheel-scroll]')) return;
         const rect = el.getBoundingClientRect();
         const vp = viewportRef.current;
         const factor = Math.exp(-event.deltaY * ZOOM_SENSITIVITY);
         actions.setViewport(zoomToCursor(vp, { left: rect.left, top: rect.top }, event.clientX, event.clientY, vp.zoom * factor));
         event.preventDefault();
      };
      el.addEventListener('wheel', onWheel, { passive: false });
      return () => el.removeEventListener('wheel', onWheel);
   }, [actions]);

   /**
    * Starts a pan from a screen point via WINDOW listeners (not element pointer-capture), so the pen
    * overlay - or a Space/middle-drag anywhere - can begin one and the move/up still land off the clip.
    * The pan math is raw screen px (the world translate applies before the scale).
    */
   const beginPan = useCallback(
      (clientX: number, clientY: number) => {
         const vp = viewportRef.current;
         panStart.current = { x: clientX, y: clientY, origX: vp.x, origY: vp.y, zoom: vp.zoom };
         setIsPanning(true);
         const onMove = (moveEvent: PointerEvent) => {
            const start = panStart.current;
            if (!start) return;
            actions.setViewport({ x: start.origX + (moveEvent.clientX - start.x), y: start.origY + (moveEvent.clientY - start.y), zoom: start.zoom });
         };
         const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            panStart.current = null;
            setIsPanning(false);
         };
         window.addEventListener('pointermove', onMove);
         window.addEventListener('pointerup', onUp);
      },
      [actions],
   );

   /** The current view's world center + the clip's center screen point (for a menu-driven create/anchor). */
   const currentViewCenter = (): Point => {
      const el = clipRef.current;
      if (!el) return viewCenter;
      const rect = el.getBoundingClientRect();
      return screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2, { left: rect.left, top: rect.top }, viewportRef.current);
   };

   /** Frames every spatial item, centered and zoom-clamped (origin when the board is empty). */
   const handleFitToContent = () => {
      const el = clipRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      actions.setViewport(fitViewport(Object.values(items), { width: rect.width, height: rect.height }, FIT_PADDING));
   };

   return {
      clipRef,
      viewport,
      viewportRef,
      viewCenter,
      clipRect,
      isPanning,
      beginPan,
      cursorToWorld,
      originViewport,
      jumpToViewCenter,
      currentViewCenter,
      handleFitToContent,
      jumpXRef,
   };
}
