// -- React Imports --
import { useCallback, type RefObject } from 'react';

// -- Other Library Imports --
import { useStore } from 'zustand';

// -- Store Imports --
import type { PdfStore } from '@/lib/stores/pdfStore';

/*
 * Zoom math for the reader: derives the effective page width from the store's zoom multiplier and the
 * fit-width base, and exposes the toolbar's controls (step, reset, fit-width, fit-page). Zoom lives in
 * the store (kept with the instance, never persisted); every clamp is the store's, so the controls just
 * hand it a target value. Fit presets read the scroll container's live dimensions at click time.
 */

/** How much one zoom step (button / keyboard) moves the multiplier - a few steps span the range. */
const ZOOM_STEP = 0.25;

/** Per-wheel-tick multiplier - a fine, precise nudge (~4%), far smaller than a button step. */
const WHEEL_ZOOM_FACTOR = 1.04;

interface PdfZoomInput {
   /** The scroll container, read live by the fit-page preset for its available height. */
   scrollRef: RefObject<HTMLElement | null>;
   /** The measured inner content width of the scroller (fit-width fills this). */
   measuredWidth: number;
   /** The 100% readable width: `min(measuredWidth, cap)`; `effectivePageWidth = round(baseWidth * zoom)`. */
   baseWidth: number;
   /** Current page aspect (height / width), so fit-page can size a page's height to the viewport. */
   pageAspect: number;
}

interface PdfZoom {
   zoom: number;
   /** The CSS width passed to each page, at the current zoom. */
   effectivePageWidth: number;
   zoomIn: () => void;
   zoomOut: () => void;
   /** A single fine wheel-tick nudge (`dir` +1 in, -1 out); far smaller than a button step. */
   wheelZoom: (dir: 1 | -1) => void;
   /** Returns to 100% (the readable-width baseline). */
   resetZoom: () => void;
   /** Zooms so a page fills the container width. */
   fitWidth: () => void;
   /** Zooms so a page's height fits the viewport. */
   fitPage: () => void;
}

export function usePdfZoom(store: PdfStore, { scrollRef, measuredWidth, baseWidth, pageAspect }: PdfZoomInput): PdfZoom {
   const zoom = useStore(store, (state) => state.zoom);
   const { setZoom } = store.getState().actions;

   const effectivePageWidth = Math.round(baseWidth * zoom);

   // Read the live zoom on each step so a keyboard-driven repeat never closes over a stale value.
   const zoomIn = useCallback(() => setZoom(store.getState().zoom + ZOOM_STEP), [store, setZoom]);
   const zoomOut = useCallback(() => setZoom(store.getState().zoom - ZOOM_STEP), [store, setZoom]);
   const wheelZoom = useCallback(
      (dir: 1 | -1) => setZoom(store.getState().zoom * (dir > 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR)),
      [store, setZoom],
   );
   const resetZoom = useCallback(() => setZoom(1), [setZoom]);

   const fitWidth = useCallback(() => {
      if (baseWidth <= 0) return;
      setZoom(measuredWidth / baseWidth);
   }, [setZoom, measuredWidth, baseWidth]);

   const fitPage = useCallback(() => {
      const scroller = scrollRef.current;
      if (!scroller || baseWidth <= 0 || pageAspect <= 0) return;
      const styles = getComputedStyle(scroller);
      const padY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
      const available = scroller.clientHeight - padY;
      if (available <= 0) return;
      setZoom(available / (baseWidth * pageAspect));
   }, [scrollRef, setZoom, baseWidth, pageAspect]);

   return { zoom, effectivePageWidth, zoomIn, zoomOut, wheelZoom, resetZoom, fitWidth, fitPage };
}
