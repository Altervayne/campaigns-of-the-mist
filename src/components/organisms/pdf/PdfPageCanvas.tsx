// -- React Imports --
import { memo, useCallback, useEffect, useRef, useState } from 'react';

// -- Component Imports --
import { MistSpinner } from '@/components/molecules/MistSpinner';
import { PdfAnnotationLayer } from './PdfAnnotationLayer';

// -- Type Imports --
import type { PdfAnnotation } from '@/lib/types/pdfAnnotation';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

/*
 * One page of the reader. Its box always reserves height (from an aspect ratio) so the virtualized
 * scroll stays stable, but the <canvas> mounts and renders only while `isVisible` - a 300-page
 * document therefore never holds 300 canvases.
 *
 * The page renders into an OFFSCREEN canvas and is blitted onto the visible one only once it's ready, so a
 * re-render (a zoom step, a re-fit) never clears the page - the current bitmap stays put and the CSS width
 * follows the zoom instantly, then snaps crisp when the new render lands. The backing resolution is capped so
 * an extreme zoom can't allocate an enormous bitmap (CSS upscales past the cap).
 */

/** Cap on the canvas backing width (px); past this the CSS width upscales instead of growing the bitmap. */
const MAX_CANVAS_WIDTH = 3000;

interface PdfPageCanvasProps {
   proxy: PDFDocumentProxy;
   /** 1-based page number. */
   pageNumber: number;
   /** CSS width for the page at the current zoom, in px. */
   width: number;
   /** Aspect (height / width) to reserve before this page's own size is known. */
   defaultAspect: number;
   /** Whether the page is near enough the viewport to render its canvas. */
   isVisible: boolean;
   /** This page's annotations, painted over the canvas. */
   annotations: PdfAnnotation[];
   /** Registers the page box with the viewport observers. */
   registerPage: (pageNumber: number, el: HTMLElement | null) => void;
}

// Memoized: during a wheel-zoom only the column's CSS zoom changes, so with the render width held steady these
// props don't, and 491 pages skip re-rendering entirely.
export const PdfPageCanvas = memo(function PdfPageCanvas({ proxy, pageNumber, width, defaultAspect, isVisible, annotations, registerPage }: PdfPageCanvasProps) {
   const canvasRef = useRef<HTMLCanvasElement>(null);
   const [aspect, setAspect] = useState(defaultAspect);
   const [rendering, setRendering] = useState(false);
   // Whether the visible canvas currently holds a bitmap. Drives the spinner: only a FIRST render (or a
   // re-render after the page scrolled out and back) shows it - a zoom re-render keeps the old bitmap on
   // screen, so no spinner.
   const [hasBitmap, setHasBitmap] = useState(false);

   const boxRef = useCallback((el: HTMLElement | null) => registerPage(pageNumber, el), [pageNumber, registerPage]);

   useEffect(() => {
      if (!isVisible || width <= 0) {
         // Off-screen: the canvas unmounts, so its bitmap is gone - a return must render (and spin) afresh.
         setRendering(false);
         setHasBitmap(false);
         return;
      }
      let cancelled = false;
      let renderTask: RenderTask | null = null;
      setRendering(true);

      void (async () => {
         try {
            const page = await proxy.getPage(pageNumber);
            if (cancelled) return;
            const base = page.getViewport({ scale: 1 });
            if (base.width > 0) setAspect(base.height / base.width);

            const dpr = window.devicePixelRatio || 1;
            // Clamp the backing scale so the bitmap width never exceeds the cap; the CSS width stays full.
            const scale = Math.min((width / base.width) * dpr, MAX_CANVAS_WIDTH / base.width);
            const viewport = page.getViewport({ scale });

            // Render offscreen, then blit onto the visible canvas in one step, so a re-render never blanks it.
            const offscreen = document.createElement('canvas');
            offscreen.width = Math.floor(viewport.width);
            offscreen.height = Math.floor(viewport.height);
            const offscreenCtx = offscreen.getContext('2d');
            if (!offscreenCtx) return;

            renderTask = page.render({ canvas: offscreen, canvasContext: offscreenCtx, viewport });
            await renderTask.promise;
            if (cancelled) return;

            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (!canvas || !ctx) return;
            canvas.width = offscreen.width;
            canvas.height = offscreen.height;
            ctx.drawImage(offscreen, 0, 0);
            setHasBitmap(true);
         } catch {
            // A cancelled render (unmount / re-fit) rejects here; nothing to surface.
         } finally {
            // Clear the spinner unless this run was superseded (unmount or a re-fit that starts a fresh one).
            if (!cancelled) setRendering(false);
         }
      })();

      return () => {
         cancelled = true;
         renderTask?.cancel();
      };
   }, [isVisible, proxy, pageNumber, width]);

   return (
      <div
         ref={boxRef}
         data-page={pageNumber}
         // The page sheet renders PDF content, which assumes white paper, so it stays white in every app
         // theme (the surrounding gutter is themed). The canvas fully covers it once rendered.
         className="relative shrink-0 overflow-hidden bg-white shadow-md shadow-black/10"
         style={{ width, height: Math.round(width * aspect) }}
      >
         {/* The CSS size follows the zoom immediately (scaling the current bitmap) while the higher-res
             re-render runs; the backing pixels are set imperatively once that render blits in. */}
         {isVisible ? <canvas ref={canvasRef} className="block" style={{ width, height: Math.round(width * aspect) }} /> : null}
         {isVisible && annotations.length > 0 ? <PdfAnnotationLayer annotations={annotations} width={width} height={Math.round(width * aspect)} /> : null}
         {rendering && !hasBitmap ? (
            // A heavy page can take seconds to rasterize; the mist over the (white) sheet reads as loading
            // rather than a frozen blank. Fixed grey since the sheet is always white, not app-themed.
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-neutral-500">
               <MistSpinner size={64} comet />
            </div>
         ) : null}
      </div>
   );
});
