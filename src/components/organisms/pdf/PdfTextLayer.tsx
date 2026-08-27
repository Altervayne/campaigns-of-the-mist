// -- React Imports --
import { memo, useEffect, useRef } from 'react';

// -- Loader / Cache Imports --
import { loadPdfjs } from '@/lib/pdf/pdfjsLoader';
import { getPageTextContent } from '@/lib/pdf/pdfTextContent';
import { registerTextLayer, unregisterTextLayer } from '@/lib/pdf/pdfTextLayerRegistry';

// -- Context Imports --
import { usePdfMarkup } from '@/lib/pdf/PdfMarkupContext';

// -- Type Imports --
import type { TextLayerHandle } from '@/lib/pdf/pdfTextLayerRegistry';
import type { PDFDocumentProxy } from 'pdfjs-dist';

/*
 * The per-page selectable text layer: transparent, absolutely-positioned spans pdf.js lays over the
 * canvas so the page's real text can be selected and copied. It mounts only while the page is visible
 * and rebuilds on the settled render width, mirroring the canvas lifecycle, so a long book never holds
 * a text layer per page.
 *
 * Alignment rides the PLAIN CSS scale (width / base.width), never the canvas's dpr/cap-boosted scale:
 * the layer overlays CSS pixels, so reusing the canvas viewport drifts the glyph boxes off the glyphs.
 * That scale feeds pdf.js's `--total-scale-factor`; the column's live CSS zoom scales this layer for
 * free between settles.
 *
 * Read mode leaves the layer selectable (the I-beam is the whole discoverability story); markup mode
 * makes it inert so the capture layer owns every drag - except the Text highlighter, which selects text
 * to snap its highlights, so the layer stays selectable while it is armed.
 */

interface PdfTextLayerProps {
   proxy: PDFDocumentProxy;
   /** 1-based page number. */
   pageNumber: number;
   /** The settled CSS render width of the page box, in px. */
   width: number;
   /** Whether the page is near enough the viewport to build its text layer. */
   isVisible: boolean;
}

export const PdfTextLayer = memo(function PdfTextLayer({ proxy, pageNumber, width, isVisible }: PdfTextLayerProps) {
   const { mode, tool, highlightMode } = usePdfMarkup();
   const containerRef = useRef<HTMLDivElement>(null);

   useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      if (!isVisible || width <= 0) {
         container.replaceChildren();
         return;
      }
      let cancelled = false;
      let textLayer: { cancel: () => void } | null = null;
      let handle: TextLayerHandle | null = null;

      void (async () => {
         try {
            const [pdfjs, page, textContent] = await Promise.all([loadPdfjs(), proxy.getPage(pageNumber), getPageTextContent(proxy, pageNumber)]);
            if (cancelled) return;
            const base = page.getViewport({ scale: 1 });
            if (base.width <= 0) return;
            // Plain CSS scale: the layer overlays CSS px, so it must NOT take the canvas's dpr/cap boost.
            const scale = width / base.width;
            const viewport = page.getViewport({ scale });
            container.style.setProperty('--total-scale-factor', String(scale));
            container.style.setProperty('--scale-factor', String(scale));
            container.replaceChildren();
            const tl = new pdfjs.TextLayer({ textContentSource: textContent, container, viewport });
            textLayer = tl;
            await tl.render();
            if (cancelled) return;
            // Publish the rendered spans so the search overlay can paint over the exact glyph rects.
            handle = { textDivs: tl.textDivs, itemsStr: tl.textContentItemsStr };
            registerTextLayer(proxy, pageNumber, handle);
         } catch {
            // A cancelled build (unmount / re-fit) rejects here; nothing to surface.
         }
      })();

      return () => {
         cancelled = true;
         textLayer?.cancel();
         if (handle) unregisterTextLayer(proxy, pageNumber, handle);
         container.replaceChildren();
      };
   }, [isVisible, proxy, pageNumber, width]);

   // Selectable in read mode, and while the Text highlighter is armed so its selection drives the highlight.
   // Otherwise inert, so the capture layer below owns every drag.
   const selectable = mode === 'read' || (mode === 'markup' && tool === 'highlight' && highlightMode === 'text');
   return (
      <div
         ref={containerRef}
         className="pdf-text-layer absolute inset-0"
         style={{ pointerEvents: selectable ? 'auto' : 'none', userSelect: selectable ? 'text' : 'none' }}
      />
   );
});
