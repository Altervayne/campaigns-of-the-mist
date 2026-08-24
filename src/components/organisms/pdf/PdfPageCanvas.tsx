// -- React Imports --
import { useCallback, useEffect, useRef, useState } from 'react';

// -- Type Imports --
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

/*
 * One page of the reader. Its box always reserves height (from an aspect ratio) so the virtualized
 * scroll stays stable, but the <canvas> mounts and renders only while `isVisible` - a 300-page
 * document therefore never holds 300 canvases. The canvas backs at devicePixelRatio for crispness
 * and displays at the fit-width CSS size.
 */

interface PdfPageCanvasProps {
   proxy: PDFDocumentProxy;
   /** 1-based page number. */
   pageNumber: number;
   /** Fit-width CSS width for the page, in px. */
   width: number;
   /** Aspect (height / width) to reserve before this page's own size is known. */
   defaultAspect: number;
   /** Whether the page is near enough the viewport to render its canvas. */
   isVisible: boolean;
   /** Registers the page box with the viewport observers. */
   registerPage: (pageNumber: number, el: HTMLElement | null) => void;
}

export function PdfPageCanvas({ proxy, pageNumber, width, defaultAspect, isVisible, registerPage }: PdfPageCanvasProps) {
   const canvasRef = useRef<HTMLCanvasElement>(null);
   const [aspect, setAspect] = useState(defaultAspect);

   const boxRef = useCallback((el: HTMLElement | null) => registerPage(pageNumber, el), [pageNumber, registerPage]);

   useEffect(() => {
      if (!isVisible || width <= 0) return;
      let cancelled = false;
      let renderTask: RenderTask | null = null;

      void (async () => {
         try {
            const page = await proxy.getPage(pageNumber);
            if (cancelled) return;
            const base = page.getViewport({ scale: 1 });
            if (base.width > 0) setAspect(base.height / base.width);

            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (!canvas || !ctx) return;

            const dpr = window.devicePixelRatio || 1;
            const viewport = page.getViewport({ scale: (width / base.width) * dpr });
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            canvas.style.width = `${width}px`;
            canvas.style.height = `${width * (base.height / base.width)}px`;

            renderTask = page.render({ canvas, canvasContext: ctx, viewport });
            await renderTask.promise;
         } catch {
            // A cancelled render (unmount / re-fit) rejects here; nothing to surface.
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
         className="shrink-0 overflow-hidden bg-white shadow-md shadow-black/10"
         style={{ width, height: Math.round(width * aspect) }}
      >
         {isVisible ? <canvas ref={canvasRef} className="block" /> : null}
      </div>
   );
}
