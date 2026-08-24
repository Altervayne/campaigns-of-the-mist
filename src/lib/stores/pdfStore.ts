// -- Other Library Imports --
import { create } from 'zustand';

// -- Pdf Data Layer Imports --
import { loadPdf } from '@/lib/pdf/pdfRepository';
import { getPdfBlob } from '@/lib/pdf/pdfAssetRepository';
import { loadPdfjs } from '@/lib/pdf/pdfjsLoader';

// -- Type Imports --
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import type { PdfDocument } from '@/lib/types/pdf';

/*
 * Pdf store - the React-facing, in-memory view of ONE open PDF, backed by the pdf repository and
 * the pdf-asset store. A PDF is READ-ONLY: there is no edit buffer, no debounce-save, no drawer
 * write-back - only the live pdf.js document plus the current page. It mirrors the per-instance
 * factory shape of the note/board stores (one store per open PDF), minus every mutation path.
 *
 * The store owns a native resource: the pdf.js document (a worker transport). It keeps the
 * `loadingTask` so `dispose` can tear it down (`loadingTask.destroy()` - the proxy itself has no
 * destroy), which the registry calls on every dispose path.
 */

/** Zoom bounds: the render scale multiplier over the fit-width base. */
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 2;

/** The load lifecycle of the open PDF. */
export type PdfStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface PdfState {
   /** The open PDF's id, or `null` before the first hydrate. */
   pdfId: string | null;
   /** The loaded aggregate (title + page count), or `null` until ready. */
   doc: PdfDocument | null;
   /** The live pdf.js document, or `null` until ready; the page renderer reads it. */
   proxy: PDFDocumentProxy | null;
   /** The pdf.js loading task, kept so {@link PdfState.actions.dispose} can tear down the worker document. */
   loadingTask: PDFDocumentLoadingTask | null;
   /** The page most in view, 1-based; drives the page indicator. */
   currentPage: number;
   /**
    * A monotonic counter bumped by {@link PdfState.actions.requestPage} - the explicit "jump here" signal an
    * ALREADY-OPEN reader listens for. The reader freezes its scroll target at mount, so a plain `setPage` moves
    * the indicator without scrolling; incrementing this makes the mounted surface scroll to `currentPage`.
    */
   jumpSeq: number;
   /** The render scale multiplier over the fit-width base; ephemeral (kept with the instance, never persisted). */
   zoom: number;
   status: PdfStatus;
   actions: {
      /**
       * Loads the PDF row + its bytes, parses the document, and stashes the live proxy. Idempotent:
       * bails when this instance is already loading or ready (guards a StrictMode double-mount / rapid
       * re-activate from firing two `getDocument` calls). Sets `status:'error'` on a missing row or a
       * corrupt/encrypted file, tearing down any partial loading task.
       */
      hydrate: (pdfId: string) => Promise<void>;
      /** Sets the current page, clamped to `[1, pageCount]`. No-op before the document is ready. */
      setPage: (page: number) => void;
      /**
       * Jumps to `page` (clamped to `[1, pageCount]`): sets `currentPage` AND bumps {@link PdfState.jumpSeq} so
       * an already-open reader scrolls there. Use for an explicit navigation (a page link); {@link setPage} is
       * for the scroll-driven indicator updates that must NOT trigger a jump. No-op before the document is ready.
       */
      requestPage: (page: number) => void;
      /** Sets the zoom multiplier, clamped to `[MIN_ZOOM, MAX_ZOOM]`. Ephemeral, never written to the row. */
      setZoom: (zoom: number) => void;
      /** Tears down the pdf.js document and resets to the initial state. Idempotent. */
      dispose: () => void;
   };
}

const initialState: Pick<PdfState, 'pdfId' | 'doc' | 'proxy' | 'loadingTask' | 'currentPage' | 'jumpSeq' | 'zoom' | 'status'> = {
   pdfId: null,
   doc: null,
   proxy: null,
   loadingTask: null,
   currentPage: 1,
   jumpSeq: 0,
   zoom: 1,
   status: 'idle',
};

/**
 * Builds a pdf store instance: the live document plus the read-only action API. Each open PDF tab
 * owns its own instance (like a board/note), so two PDFs never share a document.
 */
export function createPdfStore() {
   const useStore = create<PdfState>()((set, get) => ({
      ...initialState,
      actions: {
         hydrate: async (pdfId) => {
            const current = get();
            // Already loading or ready for this instance: a second call (StrictMode, rapid re-activate)
            // would spawn a duplicate document, so bail.
            if (current.status === 'loading' || current.status === 'ready') return;

            set({ status: 'loading', pdfId });
            let loadingTask: PDFDocumentLoadingTask | null = null;
            try {
               const doc = await loadPdf(pdfId);
               if (!doc) {
                  set({ ...initialState, pdfId, status: 'error' });
                  return;
               }
               const blob = await getPdfBlob(doc.assetHash);
               if (!blob) {
                  set({ ...initialState, pdfId, status: 'error' });
                  return;
               }
               const data = await blob.arrayBuffer();
               const pdfjs = await loadPdfjs();
               loadingTask = pdfjs.getDocument({ data });
               const proxy = await loadingTask.promise;
               set({ pdfId, doc, proxy, loadingTask, currentPage: 1, status: 'ready' });
            } catch {
               // Corrupt / encrypted / read failure: drop any partial task and surface the error state.
               if (loadingTask) void loadingTask.destroy();
               set({ ...initialState, pdfId, status: 'error' });
            }
         },

         setPage: (page) => {
            const { doc } = get();
            if (!doc) return;
            const clamped = Math.min(Math.max(page, 1), doc.pageCount);
            set({ currentPage: clamped });
         },

         requestPage: (page) => {
            const { doc, jumpSeq } = get();
            if (!doc) return;
            const clamped = Math.min(Math.max(page, 1), doc.pageCount);
            set({ currentPage: clamped, jumpSeq: jumpSeq + 1 });
         },

         setZoom: (zoom) => {
            const clamped = Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM);
            set({ zoom: clamped });
         },

         dispose: () => {
            const { loadingTask } = get();
            if (loadingTask) void loadingTask.destroy();
            set({ ...initialState });
         },
      },
   }));

   return useStore;
}

/** A single pdf store instance: the live document + read-only actions. */
export type PdfStore = ReturnType<typeof createPdfStore>;
