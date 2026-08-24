// -- React Imports --
import { useEffect, useState } from 'react';

// -- Type Imports --
import type { PDFDocumentProxy } from 'pdfjs-dist';

/** Fallback page aspect (height / width) before the first page is measured: ISO A4 portrait. */
const DEFAULT_ASPECT = 1.414;

/**
 * Reads page 1's aspect ratio (height / width) once, so every not-yet-rendered page box can reserve a
 * plausible height for the virtualized scroll (each page corrects to its own true aspect when it
 * renders). One `getPage` call, not one per page, so a large document stays cheap to open.
 */
export function usePdfDefaultAspect(proxy: PDFDocumentProxy): number {
   const [aspect, setAspect] = useState(DEFAULT_ASPECT);

   useEffect(() => {
      let cancelled = false;
      void (async () => {
         try {
            const page = await proxy.getPage(1);
            const viewport = page.getViewport({ scale: 1 });
            if (!cancelled && viewport.width > 0) setAspect(viewport.height / viewport.width);
         } catch {
            // Keep the fallback; a page-level render failure surfaces on that page, not here.
         }
      })();
      return () => { cancelled = true; };
   }, [proxy]);

   return aspect;
}
