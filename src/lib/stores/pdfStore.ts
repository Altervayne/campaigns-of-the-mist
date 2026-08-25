// -- Other Library Imports --
import { create } from 'zustand';

// -- Pdf Data Layer Imports --
import { getPdf, savePdfToLinkedDrawerItem } from '@/lib/pdf/pdfRepository';
import { recordToPdfDocument } from '@/lib/pdf/pdfRecords';
import { getPdfBlob } from '@/lib/pdf/pdfAssetRepository';
import { loadPdfjs } from '@/lib/pdf/pdfjsLoader';

// -- Utility Imports --
import { createDebouncer } from '@/lib/utils/createDebouncer';

// -- Type Imports --
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import type { PdfDocument } from '@/lib/types/pdf';
import type { PdfAnnotation } from '@/lib/types/pdfAnnotation';

/*
 * Pdf store - the React-facing, in-memory view of ONE open PDF, backed by the pdf repository and
 * the pdf-asset store. The live pdf.js document plus the current page are read-only; markup
 * ANNOTATIONS are the one writable path, autosaving to both the working row and the linked drawer
 * copy (an open PDF is always drawer-backed). It also holds the ephemeral markup tool state (the
 * read/markup mode, the active tool, and the pen params), which - like `zoom` - lives with the
 * instance and is reset on dispose but never persisted. It mirrors the per-instance factory shape
 * of the note/board stores (one store per open PDF).
 *
 * The store owns a native resource: the pdf.js document (a worker transport). It keeps the
 * `loadingTask` so `dispose` can tear it down (`loadingTask.destroy()` - the proxy itself has no
 * destroy), which the registry calls on every dispose path.
 */

/** Zoom bounds: the render scale multiplier over the fit-width base. */
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 2;

/** How long an annotation edit settles before it is written back to the pdf row + drawer copy. */
const PDF_SAVE_DEBOUNCE_MS = 400;

/** Distributes `Omit` across a union so each member drops the keys independently. */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

/** An `updateAnnotation` patch: any field of a member kind except its discriminant and id. */
type PdfAnnotationPatch = Partial<DistributiveOmit<PdfAnnotation, 'kind' | 'id'>>;

/** The load lifecycle of the open PDF. */
export type PdfStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Whether the reader is a read-only viewer or accepts markup gestures. */
export type PdfMarkupMode = 'read' | 'markup';

/** The armed markup tool while in markup mode. */
export type PdfTool = 'pen' | 'eraser' | 'highlight' | 'comment';

/** The pen's default ink: a legible rose on white paper. */
const DEFAULT_PEN_COLOR = '#e11d48';

/** The pen's default width, in the stroke-width selector's world px. */
const DEFAULT_PEN_WIDTH = 3;

/** The highlighter's default fill: a marker yellow on white paper. */
const DEFAULT_HIGHLIGHT_COLOR = '#fde047';

/** The comment region's default outline/fill: a warm amber. */
const DEFAULT_COMMENT_COLOR = '#f59e0b';

/** Fixed highlight fill opacity - no alpha slider in v1. */
export const HIGHLIGHT_ALPHA = 0.35;

export interface PdfState {
   /** The open PDF's id, or `null` before the first hydrate. */
   pdfId: string | null;
   /** The loaded aggregate (title + page count + annotations), or `null` until ready. */
   doc: PdfDocument | null;
   /** The linked drawer `PDF` item, or `null` when this pdf was never saved. Autosave targets it. */
   drawerItemId: string | null;
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
   /** Read-only viewer vs. markup gestures; ephemeral, defaults to `read` so a stray drag never scribbles. */
   markupMode: PdfMarkupMode;
   /** The armed markup tool; ephemeral. Meaningful only in markup mode. */
   tool: PdfTool;
   /** The pen's ink hex; ephemeral. Real hex - annotation ink is user content on white paper, not chrome. */
   penColor: string;
   /** The pen's width in the selector's world px; ephemeral. Normalized to a page-width fraction at commit. */
   penWidth: number;
   /** The highlighter's fill hex; ephemeral. Real hex - user content on white paper. */
   highlightColor: string;
   /** The comment region's outline/fill hex; ephemeral. Real hex - user content on white paper. */
   commentColor: string;
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
      /** Switches between read-only viewing and markup. Ephemeral. */
      setMarkupMode: (mode: PdfMarkupMode) => void;
      /** Arms a markup tool. Ephemeral. */
      setTool: (tool: PdfTool) => void;
      /** Sets the pen's ink hex. Ephemeral. */
      setPenColor: (color: string) => void;
      /** Sets the pen's width (selector world px). Ephemeral. */
      setPenWidth: (width: number) => void;
      /** Sets the highlighter's fill hex. Ephemeral. */
      setHighlightColor: (color: string) => void;
      /** Sets the comment region's hex. Ephemeral. */
      setCommentColor: (color: string) => void;
      /** Adds a markup annotation to the live document and debounce-persists it. No-op before the document is ready. */
      addAnnotation: (annotation: PdfAnnotation) => void;
      /** Merges a patch onto an existing annotation (discriminant + id untouched) and debounce-persists it. No-op if absent. */
      updateAnnotation: (id: string, patch: PdfAnnotationPatch) => void;
      /** Removes an annotation and debounce-persists the change. No-op if absent. */
      removeAnnotation: (id: string) => void;
      /**
       * Immediately persists the current annotations onto the row + drawer copy AND disarms any pending
       * debounce. The reader calls this on unmount (a tab switch fires no blur), and the close path calls it
       * before reaping the row, so the last stroke lands and no stale timer can fire late. Awaitable.
       */
      flush: () => Promise<void>;
      /** Tears down the pdf.js document and resets to the initial state. Idempotent. */
      dispose: () => void;
   };
}

const initialState: Pick<PdfState, 'pdfId' | 'doc' | 'drawerItemId' | 'proxy' | 'loadingTask' | 'currentPage' | 'jumpSeq' | 'zoom' | 'markupMode' | 'tool' | 'penColor' | 'penWidth' | 'highlightColor' | 'commentColor' | 'status'> = {
   pdfId: null,
   doc: null,
   drawerItemId: null,
   proxy: null,
   loadingTask: null,
   currentPage: 1,
   jumpSeq: 0,
   zoom: 1,
   markupMode: 'read',
   tool: 'pen',
   penColor: DEFAULT_PEN_COLOR,
   penWidth: DEFAULT_PEN_WIDTH,
   highlightColor: DEFAULT_HIGHLIGHT_COLOR,
   commentColor: DEFAULT_COMMENT_COLOR,
   status: 'idle',
};

/**
 * Builds a pdf store instance: the live document plus the action API. Each open PDF tab owns its own
 * instance (like a board/note), so two PDFs never share a document. The `saveDebounceMs` option exists
 * for tests; production uses the default.
 */
export function createPdfStore(options: { saveDebounceMs?: number } = {}) {
   const saveDebounceMs = options.saveDebounceMs ?? PDF_SAVE_DEBOUNCE_MS;

   const useStore = create<PdfState>()((set, get) => {
      /** Persists the current annotations onto the row + drawer copy. Best-effort; a missing row is a no-op. */
      const debouncedSave = createDebouncer<PdfDocument>(saveDebounceMs, (doc) => {
         void savePdfToLinkedDrawerItem(doc, get().drawerItemId).catch(console.error);
      });

      return {
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
                  // Read the full record (not the aggregate) so the drawer link rides along for autosave.
                  const record = await getPdf(pdfId);
                  if (!record) {
                     set({ ...initialState, pdfId, status: 'error' });
                     return;
                  }
                  const doc = recordToPdfDocument(record);
                  const blob = await getPdfBlob(doc.assetHash);
                  if (!blob) {
                     set({ ...initialState, pdfId, status: 'error' });
                     return;
                  }
                  const data = await blob.arrayBuffer();
                  const pdfjs = await loadPdfjs();
                  loadingTask = pdfjs.getDocument({ data });
                  const proxy = await loadingTask.promise;
                  set({ pdfId, doc, drawerItemId: record.drawerItemId ?? null, proxy, loadingTask, currentPage: 1, status: 'ready' });
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

            setMarkupMode: (mode) => set({ markupMode: mode }),

            setTool: (tool) => set({ tool }),

            setPenColor: (color) => set({ penColor: color }),

            setPenWidth: (width) => set({ penWidth: width }),

            setHighlightColor: (color) => set({ highlightColor: color }),

            setCommentColor: (color) => set({ commentColor: color }),

            addAnnotation: (annotation) => {
               const { doc } = get();
               if (!doc) return;
               const next: PdfDocument = { ...doc, annotations: { ...(doc.annotations ?? {}), [annotation.id]: annotation } };
               set({ doc: next });
               debouncedSave.run(next);
            },

            updateAnnotation: (id, patch) => {
               const { doc } = get();
               if (!doc) return;
               const existing = doc.annotations?.[id];
               if (!existing) return;
               const merged = { ...existing, ...patch } as PdfAnnotation;
               const next: PdfDocument = { ...doc, annotations: { ...(doc.annotations ?? {}), [id]: merged } };
               set({ doc: next });
               debouncedSave.run(next);
            },

            removeAnnotation: (id) => {
               const { doc } = get();
               if (!doc || !doc.annotations?.[id]) return;
               const nextAnnotations = { ...doc.annotations };
               delete nextAnnotations[id];
               const next: PdfDocument = { ...doc, annotations: nextAnnotations };
               set({ doc: next });
               debouncedSave.run(next);
            },

            flush: () => {
               // Disarm the pending debounce FIRST, then write now: a still-armed timer holds a stale
               // snapshot that would fire late and clobber a fresher edit after a revisit.
               debouncedSave.cancel();
               const { doc, drawerItemId } = get();
               if (!doc) return Promise.resolve();
               return savePdfToLinkedDrawerItem(doc, drawerItemId).then(() => undefined).catch((error) => {
                  console.error('Pdf flush failed:', error);
               });
            },

            dispose: () => {
               const { loadingTask } = get();
               if (loadingTask) void loadingTask.destroy();
               set({ ...initialState });
            },
         },
      };
   });

   return useStore;
}

/** A single pdf store instance: the live document + action API. */
export type PdfStore = ReturnType<typeof createPdfStore>;
