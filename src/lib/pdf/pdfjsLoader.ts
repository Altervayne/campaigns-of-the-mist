// -- Type Imports --
import type * as PdfJs from 'pdfjs-dist';

/*
 * Lazy entry point to pdf.js. The whole library is dynamically imported so it lands in the
 * deferred `pdf-vendor` chunk (never the eager shell), and the worker is configured exactly
 * once from a locally-emitted, hashed asset - no CDN, so parsing and rendering work offline.
 * Every consumer (import-time parse now, the viewer later) goes through {@link loadPdfjs}.
 */

let pdfjsPromise: Promise<typeof PdfJs> | null = null;

/**
 * Loads pdf.js and points its worker at the bundled worker asset, memoized so the dynamic
 * import and the worker setup run once per session.
 */
export function loadPdfjs(): Promise<typeof PdfJs> {
   if (!pdfjsPromise) {
      pdfjsPromise = (async () => {
         const pdfjs = await import('pdfjs-dist');
         // Vite emits the worker as a hashed asset the precache glob picks up, so it resolves
         // from the app's own origin (offline, no CDN).
         const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
         pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
         return pdfjs;
      })();
   }
   return pdfjsPromise;
}
