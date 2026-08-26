// -- React Imports --
import { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { MistSpinner } from '@/components/molecules/MistSpinner';

// -- Hook Imports --
import { useInView } from '@/hooks/useInView';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

/*
 * One page thumbnail in the nav strip: a small render of page N that jumps to it on click. It mirrors
 * PdfPageCanvas simplified - the box reserves aspect height so the strip layout stays stable, and the page
 * renders into an offscreen canvas only once the thumb has scrolled into view (the latch keeps it rendered
 * after). The paper stays white in every app theme, like the reader's page sheet; the surrounding chrome is
 * themed. A light spinner sits over the sheet until the bitmap lands.
 */

/** Cap on the thumbnail canvas backing width (px); a small thumb rarely reaches it, but an extreme dpr can't blow it up. */
const MAX_CANVAS_WIDTH = 400;

interface PdfThumbnailProps {
   proxy: PDFDocumentProxy;
   /** 1-based page number. */
   pageNumber: number;
   /** CSS width of the thumbnail, in px. */
   width: number;
   /** Aspect (height / width) to reserve before this page's own size is known. */
   defaultAspect: number;
   /** Whether this thumb is the reader's current page - gets the highlight ring. */
   isCurrent: boolean;
   onJump: (page: number) => void;
}

export const PdfThumbnail = memo(function PdfThumbnail({ proxy, pageNumber, width, defaultAspect, isCurrent, onJump }: PdfThumbnailProps) {
   const { t } = useTranslation();
   const { ref, hasBeenVisible } = useInView<HTMLButtonElement>();
   const canvasRef = useRef<HTMLCanvasElement>(null);
   const [aspect, setAspect] = useState(defaultAspect);
   const [hasBitmap, setHasBitmap] = useState(false);

   useEffect(() => {
      if (!hasBeenVisible || width <= 0) return;
      let cancelled = false;
      let renderTask: RenderTask | null = null;

      void (async () => {
         try {
            const page = await proxy.getPage(pageNumber);
            if (cancelled) return;
            const base = page.getViewport({ scale: 1 });
            if (base.width > 0) setAspect(base.height / base.width);

            const dpr = window.devicePixelRatio || 1;
            const scale = Math.min((width / base.width) * dpr, MAX_CANVAS_WIDTH / base.width);
            const viewport = page.getViewport({ scale });

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
            // A cancelled render (unmount) rejects here; nothing to surface.
         }
      })();

      return () => {
         cancelled = true;
         renderTask?.cancel();
      };
   }, [hasBeenVisible, proxy, pageNumber, width]);

   const height = Math.round(width * aspect);

   return (
      <button
         ref={ref}
         type="button"
         data-thumb-page={pageNumber}
         onClick={() => onJump(pageNumber)}
         aria-label={t('PdfView.nav.pageLabel', { page: pageNumber })}
         aria-current={isCurrent ? 'page' : undefined}
         className="group flex shrink-0 cursor-pointer flex-col items-center gap-1"
      >
         <div
            // White paper (PDF content assumes it) under a themed ring; current page reads by a primary ring.
            className={cn(
               'relative overflow-hidden rounded-sm bg-white shadow-sm ring-1 transition-colors',
               isCurrent ? 'ring-2 ring-primary' : 'ring-border group-hover:ring-primary/50',
            )}
            style={{ width, height }}
         >
            {hasBeenVisible ? <canvas ref={canvasRef} className="block" style={{ width, height }} /> : null}
            {!hasBitmap ? (
               <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-neutral-400">
                  <MistSpinner size={28} />
               </div>
            ) : null}
         </div>
         <span className={cn('text-xs tabular-nums', isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground')}>{pageNumber}</span>
      </button>
   );
});
