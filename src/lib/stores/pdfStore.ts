// -- Other Library Imports --
import { create } from 'zustand';

// -- Pdf Data Layer Imports --
import { getPdf, savePdfLastPage, savePdfToLinkedDrawerItem } from '@/lib/pdf/pdfRepository';
import { recordToPdfDocument } from '@/lib/pdf/pdfRecords';
import { getPdfBlob } from '@/lib/pdf/pdfAssetRepository';
import { loadPdfjs } from '@/lib/pdf/pdfjsLoader';
import { getPageTextIndex } from '@/lib/pdf/pdfPageTextIndex';
import { findMatches, foldText } from '@/lib/pdf/textLayerGeometry';

// -- Store Imports --
import { useAppGeneralStateStore } from '@/lib/stores/appGeneralStateStore';

// -- Utility Imports --
import { createDebouncer } from '@/lib/utils/createDebouncer';

// -- Type Imports --
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import type { PdfDocument } from '@/lib/types/pdf';
import type { PdfAnnotation, PdfAnnotationKind, PdfAnnotationVisibility } from '@/lib/types/pdfAnnotation';

/*
 * Pdf store - the React-facing, in-memory view of ONE open PDF, backed by the pdf repository and
 * the pdf-asset store. The live pdf.js document plus the current page are read-only; markup
 * ANNOTATIONS are the one writable path, autosaving to both the working row and the linked drawer
 * copy (an open PDF is always drawer-backed). It also holds the ephemeral markup tool state (the
 * read/markup mode, the active tool, and the pen params), which - like `zoom` - lives with the
 * instance and is reset on dispose but never persisted. The annotation undo/redo history (snapshot
 * stacks of prior annotation maps) is likewise ephemeral per-instance state. It mirrors the
 * per-instance factory shape of the note/board stores (one store per open PDF).
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

/** How long scrolling settles before the reading position is persisted, out of band from `doc`. */
const PDF_LAST_PAGE_DEBOUNCE_MS = 500;

/** Deepest the undo stack grows; the oldest snapshot drops once it is exceeded. */
const UNDO_STACK_CAP = 50;

/** Appends to a snapshot stack, dropping the oldest entry once the cap is passed. */
function pushCapped<T>(stack: T[], entry: T, cap: number): T[] {
   const next = [...stack, entry];
   if (next.length > cap) next.shift();
   return next;
}

/** Distributes `Omit` across a union so each member drops the keys independently. */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

/** An `updateAnnotation` patch: any field of a member kind except its discriminant and id. */
type PdfAnnotationPatch = Partial<DistributiveOmit<PdfAnnotation, 'kind' | 'id'>>;

/** The load lifecycle of the open PDF. `placeholder` is a byteless record (null hash) awaiting a file. */
export type PdfStatus = 'idle' | 'loading' | 'ready' | 'error' | 'placeholder';

/** Whether the reader is a read-only viewer or accepts markup gestures. */
export type PdfMarkupMode = 'read' | 'markup';

/** The armed markup tool while in markup mode. */
export type PdfTool = 'pen' | 'eraser' | 'highlight' | 'comment' | 'select';

/** The active tab of the left navigation panel. */
export type PdfNavTab = 'outline' | 'thumbnails';

/** One in-document search hit: the 1-based `page` and the match's folded-text span. */
export interface SearchMatch {
   page: number;
   start: number;
   length: number;
}

/** The scan lifecycle: idle before a query, scanning while pages are read, done when the sweep completes. */
export type PdfSearchStatus = 'idle' | 'scanning' | 'done';

/** Scan order: the current page first (so nearby hits surface fast), then every other page ascending. */
function searchScanOrder(currentPage: number, pageCount: number): number[] {
   const first = Math.min(Math.max(currentPage, 1), pageCount);
   const order = [first];
   for (let page = 1; page <= pageCount; page += 1) {
      if (page !== first) order.push(page);
   }
   return order;
}

/** Flattens per-page match buckets into one page-ascending list (matches within a page stay left-to-right). */
function flattenMatchesByPage(byPage: Map<number, SearchMatch[]>): SearchMatch[] {
   const out: SearchMatch[] = [];
   for (const page of [...byPage.keys()].sort((a, b) => a - b)) out.push(...byPage.get(page)!);
   return out;
}

/** How many pages a scan reads before yielding a macrotask, so a long book never blocks a paint. */
const SEARCH_YIELD_EVERY = 16;

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
   /** The comments-list panel visibility; ephemeral, defaults closed. The toolbar and palette both toggle it. */
   commentsPanelOpen: boolean;
   /** The left navigation panel (outline + thumbnails) visibility; ephemeral, defaults closed. Toolbar and palette toggle it. */
   navPanelOpen: boolean;
   /** The active navigation-panel tab; ephemeral, defaults to the outline. */
   navPanelTab: PdfNavTab;
   /**
    * Per-kind annotation visibility; ephemeral, defaults all-visible. A hidden kind is neither painted nor
    * hit-tested (you can't touch what you can't see) - view-only, the marks themselves stay on the document.
    */
   annotationVisibility: PdfAnnotationVisibility;
   /**
    * Annotation undo history: prior annotation maps, newest last. Every annotation map is a whole-object
    * replacement, so a snapshot is just the pre-op map; unchanged annotation objects are shared across
    * snapshots (structural sharing). Ephemeral, capped at {@link UNDO_STACK_CAP}, never persisted.
    */
   undoStack: Array<Record<string, PdfAnnotation>>;
   /** Redo history: annotation maps popped by {@link PdfState.actions.undo}. Cleared by any fresh mutation. Ephemeral. */
   redoStack: Array<Record<string, PdfAnnotation>>;
   /** The find bar's visibility; ephemeral, defaults closed. Search state is pure view state, never persisted. */
   searchOpen: boolean;
   /** The current query text; ephemeral. Folded before matching so it is script- and spacing-stable. */
   searchQuery: string;
   /** All matches, page-ascending then left-to-right; ephemeral. Grown incrementally as the scan sweeps pages. */
   searchMatches: SearchMatch[];
   /** The active match's index into {@link searchMatches}, or -1 when none is active; ephemeral. */
   searchActiveIndex: number;
   /** The scan lifecycle; ephemeral. */
   searchStatus: PdfSearchStatus;
   /** How many pages the current scan has read, for a "scanning N" indicator; ephemeral. */
   searchScanned: number;
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
      /** Sets the comments-list panel visibility. Ephemeral. */
      setCommentsPanelOpen: (open: boolean) => void;
      /** Flips the comments-list panel visibility. Ephemeral. */
      toggleCommentsPanel: () => void;
      /** Sets the navigation-panel visibility. Ephemeral. */
      setNavPanelOpen: (open: boolean) => void;
      /** Flips the navigation-panel visibility. Ephemeral. */
      toggleNavPanel: () => void;
      /** Selects the active navigation-panel tab. Ephemeral. */
      setNavPanelTab: (tab: PdfNavTab) => void;
      /** Shows or hides one annotation kind in the reader. Ephemeral view state, never persisted. */
      setAnnotationTypeVisible: (kind: PdfAnnotationKind, visible: boolean) => void;
      /** Shows or hides every annotation kind at once. Ephemeral. */
      setAllAnnotationsVisible: (visible: boolean) => void;
      /** Adds a markup annotation to the live document and debounce-persists it. No-op before the document is ready. */
      addAnnotation: (annotation: PdfAnnotation) => void;
      /** Replaces the whole annotation map and debounce-persists it (a bulk apply). No-op before the document is ready. */
      setAnnotations: (annotations: Record<string, PdfAnnotation>) => void;
      /** Merges a patch onto an existing annotation (discriminant + id untouched) and debounce-persists it. No-op if absent. */
      updateAnnotation: (id: string, patch: PdfAnnotationPatch) => void;
      /** Removes an annotation and debounce-persists the change. No-op if absent. */
      removeAnnotation: (id: string) => void;
      /**
       * Opens an undo checkpoint: captures the current annotation map and takes undo focus (marks pdf the
       * last-modified store). Pairs with {@link commitHistory}; a second call before commit just re-captures.
       */
      beginHistory: () => void;
      /**
       * Closes the open checkpoint. Pushes the captured map onto the undo stack (capped) and clears the redo
       * stack only when the map was actually replaced since {@link beginHistory}; an untouched gesture pushes
       * nothing.
       */
      commitHistory: () => void;
      /**
       * Drops an open checkpoint WITHOUT pushing it - for a deferred create that was abandoned (an empty
       * comment self-deleted on close), so the add-then-remove leaves no undo step.
       */
      cancelHistory: () => void;
      /** Restores the previous annotation map (moving the current onto the redo stack) and debounce-persists it. No-op with no undo step. */
      undo: () => void;
      /** Reapplies the next annotation map (moving the current onto the undo stack) and debounce-persists it. No-op with no redo step. */
      redo: () => void;
      /**
       * Immediately persists the current annotations onto the row + drawer copy AND disarms any pending
       * debounce. The reader calls this on unmount (a tab switch fires no blur), and the close path calls it
       * before reaping the row, so the last stroke lands and no stale timer can fire late. Awaitable.
       */
      flush: () => Promise<void>;
      /** Opens the find bar. Ephemeral view state. */
      openSearch: () => void;
      /** Closes the find bar and clears the query, matches, and any in-flight scan. Ephemeral. */
      closeSearch: () => void;
      /**
       * Sets the query and (re)starts the scan: cancels any in-flight scan, then - if the folded query is
       * non-empty - sweeps pages current-first, publishing page-ordered matches incrementally. An empty
       * folded query just clears the matches. Debounce belongs to the caller; this starts immediately.
       */
      setSearchQuery: (query: string) => void;
      /** Advances the active match with wrap; from none, seeds the first match at/after the current page. No-op with no matches. */
      nextMatch: () => void;
      /** Retreats the active match with wrap; from none, seeds the last match at/before the current page. No-op with no matches. */
      prevMatch: () => void;
      /** Clears the query, matches, and scan (leaving the find bar open). Ephemeral. */
      clearSearch: () => void;
      /** Tears down the pdf.js document and resets to the initial state. Idempotent. */
      dispose: () => void;
   };
}

const initialState: Pick<PdfState, 'pdfId' | 'doc' | 'drawerItemId' | 'proxy' | 'loadingTask' | 'currentPage' | 'jumpSeq' | 'zoom' | 'markupMode' | 'tool' | 'penColor' | 'penWidth' | 'highlightColor' | 'commentColor' | 'commentsPanelOpen' | 'navPanelOpen' | 'navPanelTab' | 'annotationVisibility' | 'undoStack' | 'redoStack' | 'searchOpen' | 'searchQuery' | 'searchMatches' | 'searchActiveIndex' | 'searchStatus' | 'searchScanned' | 'status'> = {
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
   commentsPanelOpen: false,
   navPanelOpen: false,
   navPanelTab: 'outline',
   annotationVisibility: { ink: true, highlight: true, comment: true, textHighlight: true },
   undoStack: [],
   redoStack: [],
   searchOpen: false,
   searchQuery: '',
   searchMatches: [],
   searchActiveIndex: -1,
   searchStatus: 'idle',
   searchScanned: 0,
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

      // Persists ONLY the reading position, out of band from `doc` so a scroll tick never re-renders any
      // `doc` subscriber. Best-effort; a missing row (or pre-ready pdfId) is a no-op.
      const debouncedSaveLastPage = createDebouncer<number>(PDF_LAST_PAGE_DEBOUNCE_MS, (page) => {
         const { pdfId, drawerItemId } = get();
         if (!pdfId) return;
         void savePdfLastPage(pdfId, page, drawerItemId).catch(console.error);
      });

      // Open undo checkpoint. `pendingSnapshot` is the restore target (null when no checkpoint is open);
      // `pendingBaseline` is the raw annotation-map ref at begin, so an actual map swap is detected by
      // reference even when the starting map is `undefined`. Closure state, not reactive (like `debouncedSave`).
      let pendingSnapshot: Record<string, PdfAnnotation> | null = null;
      let pendingBaseline: Record<string, PdfAnnotation> | undefined;

      // Cancel token for the in-flight search scan. Bumped whenever a scan should abort (new query, close,
      // clear, dispose); a running scan compares its captured id against this and bails once superseded.
      // Closure state, not reactive (like `pendingSnapshot`).
      let searchRunId = 0;

      /**
       * The cancelable incremental scan: sweeps pages current-first, buckets matches by page, and publishes
       * a page-ordered list + a scanned count after each page. Bails the moment its run is superseded, so no
       * late write from an aborted query can land. Yields a macrotask periodically so a long book never
       * blocks a paint.
       */
      const runSearch = async (query: string, runId: number) => {
         const { proxy, doc, currentPage } = get();
         if (!proxy || !doc) return;
         const foldedQuery = foldText(query);
         const byPage = new Map<number, SearchMatch[]>();
         let scanned = 0;
         for (const page of searchScanOrder(currentPage, doc.pageCount)) {
            if (runId !== searchRunId) return;
            try {
               const index = await getPageTextIndex(proxy, page);
               if (runId !== searchRunId) return;
               const hits = findMatches(index.folded, foldedQuery);
               if (hits.length > 0) byPage.set(page, hits.map((hit) => ({ page, start: hit.start, length: hit.length })));
            } catch {
               // A page that fails to parse is counted and skipped; the index cache evicts it for a later retry.
               if (runId !== searchRunId) return;
            }
            scanned += 1;
            set({ searchMatches: flattenMatchesByPage(byPage), searchScanned: scanned });
            if (scanned % SEARCH_YIELD_EVERY === 0) await new Promise((resolve) => setTimeout(resolve, 0));
         }
         if (runId !== searchRunId) return;
         set({ searchStatus: 'done' });
      };

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
                  // A null hash is an explicit placeholder (no bytes yet), not a lost file: land there before
                  // the blob fetch. A REAL hash whose blob is gone still falls to the error guard below.
                  if (!doc.assetHash) {
                     set({ pdfId, doc, drawerItemId: record.drawerItemId ?? null, status: 'placeholder' });
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
                  set({ pdfId, doc, drawerItemId: record.drawerItemId ?? null, proxy, loadingTask, currentPage: record.lastPage ?? 1, status: 'ready' });
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
               // Persist the position out of band - never onto `doc`, so scrolling re-renders nothing.
               debouncedSaveLastPage.run(clamped);
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

            setCommentsPanelOpen: (open) => set({ commentsPanelOpen: open }),

            toggleCommentsPanel: () => set((state) => ({ commentsPanelOpen: !state.commentsPanelOpen })),

            setNavPanelOpen: (open) => set({ navPanelOpen: open }),

            toggleNavPanel: () => set((state) => ({ navPanelOpen: !state.navPanelOpen })),

            setNavPanelTab: (tab) => set({ navPanelTab: tab }),

            setAnnotationTypeVisible: (kind, visible) =>
               set((state) => ({ annotationVisibility: { ...state.annotationVisibility, [kind]: visible } })),

            setAllAnnotationsVisible: (visible) => set({ annotationVisibility: { ink: visible, highlight: visible, comment: visible, textHighlight: visible } }),

            addAnnotation: (annotation) => {
               const { doc } = get();
               if (!doc) return;
               const next: PdfDocument = { ...doc, annotations: { ...(doc.annotations ?? {}), [annotation.id]: annotation } };
               set({ doc: next });
               debouncedSave.run(next);
            },

            setAnnotations: (annotations) => {
               const { doc } = get();
               if (!doc) return;
               const next: PdfDocument = { ...doc, annotations };
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

            beginHistory: () => {
               pendingBaseline = get().doc?.annotations;
               pendingSnapshot = pendingBaseline ?? {};
               // Drawing a mark pulls undo focus off the drawer onto this pdf (mirrors the board).
               useAppGeneralStateStore.getState().actions.setLastModifiedStore('pdf');
            },

            commitHistory: () => {
               if (pendingSnapshot === null) return;
               // A real op replaced the map object; an untouched gesture leaves the same ref, so push nothing.
               if (get().doc?.annotations !== pendingBaseline) {
                  const snapshot = pendingSnapshot;
                  set((state) => ({ undoStack: pushCapped(state.undoStack, snapshot, UNDO_STACK_CAP), redoStack: [] }));
               }
               pendingSnapshot = null;
            },

            cancelHistory: () => {
               pendingSnapshot = null;
            },

            undo: () => {
               const { doc, undoStack, redoStack } = get();
               if (!doc || undoStack.length === 0) return;
               const snapshot = undoStack[undoStack.length - 1];
               const current = doc.annotations ?? {};
               const next: PdfDocument = { ...doc, annotations: snapshot };
               // Drop any half-open checkpoint so a stray gesture can't bleed into the restored state.
               pendingSnapshot = null;
               set({ doc: next, undoStack: undoStack.slice(0, -1), redoStack: [...redoStack, current] });
               debouncedSave.run(next);
            },

            redo: () => {
               const { doc, undoStack, redoStack } = get();
               if (!doc || redoStack.length === 0) return;
               const snapshot = redoStack[redoStack.length - 1];
               const current = doc.annotations ?? {};
               const next: PdfDocument = { ...doc, annotations: snapshot };
               pendingSnapshot = null;
               set({ doc: next, redoStack: redoStack.slice(0, -1), undoStack: [...undoStack, current] });
               debouncedSave.run(next);
            },

            flush: async () => {
               // Disarm both pending debounces FIRST, then write now: a still-armed timer holds a stale
               // snapshot that would fire late and clobber a fresher edit after a revisit.
               debouncedSave.cancel();
               debouncedSaveLastPage.cancel();
               const { doc, drawerItemId, pdfId, currentPage } = get();
               if (!doc) return;
               try {
                  // Land the final reading position too - the page debounce may not have fired before close.
                  if (pdfId) await savePdfLastPage(pdfId, currentPage, drawerItemId);
                  await savePdfToLinkedDrawerItem(doc, drawerItemId);
               } catch (error) {
                  console.error('Pdf flush failed:', error);
               }
            },

            openSearch: () => set({ searchOpen: true }),

            closeSearch: () => {
               searchRunId += 1;
               set({ searchOpen: false, searchQuery: '', searchMatches: [], searchActiveIndex: -1, searchStatus: 'idle', searchScanned: 0 });
            },

            setSearchQuery: (query) => {
               // Supersede any in-flight scan before this one starts, so its late writes are ignored.
               searchRunId += 1;
               const runId = searchRunId;
               if (foldText(query).length === 0) {
                  set({ searchQuery: query, searchMatches: [], searchActiveIndex: -1, searchStatus: 'idle', searchScanned: 0 });
                  return;
               }
               set({ searchQuery: query, searchMatches: [], searchActiveIndex: -1, searchStatus: 'scanning', searchScanned: 0 });
               void runSearch(query, runId);
            },

            nextMatch: () => {
               const { searchMatches, searchActiveIndex, currentPage } = get();
               if (searchMatches.length === 0) return;
               if (searchActiveIndex === -1) {
                  const seeded = searchMatches.findIndex((match) => match.page >= currentPage);
                  set({ searchActiveIndex: seeded === -1 ? 0 : seeded });
                  return;
               }
               set({ searchActiveIndex: (searchActiveIndex + 1) % searchMatches.length });
            },

            prevMatch: () => {
               const { searchMatches, searchActiveIndex, currentPage } = get();
               if (searchMatches.length === 0) return;
               if (searchActiveIndex === -1) {
                  let seeded = -1;
                  for (let i = searchMatches.length - 1; i >= 0; i -= 1) {
                     if (searchMatches[i].page <= currentPage) {
                        seeded = i;
                        break;
                     }
                  }
                  set({ searchActiveIndex: seeded === -1 ? searchMatches.length - 1 : seeded });
                  return;
               }
               set({ searchActiveIndex: (searchActiveIndex - 1 + searchMatches.length) % searchMatches.length });
            },

            clearSearch: () => {
               searchRunId += 1;
               set({ searchQuery: '', searchMatches: [], searchActiveIndex: -1, searchStatus: 'idle', searchScanned: 0 });
            },

            dispose: () => {
               const { loadingTask } = get();
               if (loadingTask) void loadingTask.destroy();
               pendingSnapshot = null;
               searchRunId += 1;
               set({ ...initialState });
            },
         },
      };
   });

   return useStore;
}

/** A single pdf store instance: the live document + action API. */
export type PdfStore = ReturnType<typeof createPdfStore>;
