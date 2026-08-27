// -- React Imports --
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { useStore } from 'zustand';
import cuid from 'cuid';

// -- Icon Imports --
import { FileWarning } from 'lucide-react';

// -- Component Imports --
import { MistSpinner } from '@/components/molecules/MistSpinner';
import { PdfPageCanvas } from './PdfPageCanvas';
import { PdfToolbar } from './PdfToolbar';
import { PdfMarkupToolbar } from './PdfMarkupToolbar';
import { PdfCommentsPanel } from './PdfCommentsPanel';
import { PdfNavPanel } from './PdfNavPanel';
import { PdfMarkupApplyDialog } from './PdfMarkupApplyDialog';
import { PdfRepairState } from './PdfRepairState';
import { PdfSelectionActionBar } from './PdfSelectionActionBar';
import { PdfFindBar } from './PdfFindBar';

// -- Local Imports --
import { usePdfMarkupApply } from './usePdfMarkupApply';
import { usePdfTextSelection } from './usePdfTextSelection';
import { usePdfContainerWidth } from './usePdfContainerWidth';
import { usePdfDefaultAspect } from './usePdfDefaultAspect';
import { usePdfZoom } from './usePdfZoom';
import { useSettledWidth } from './useSettledWidth';
import { useVisiblePages } from './useVisiblePages';

// -- Store Imports --
import { useActivePdfInstance } from '@/lib/pdf/ActivePdfStoreContext';

// -- Hook Imports --
import { useNoteLinkActivation } from '@/hooks/useNoteLinkActivation';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { annotationBounds, clampTranslation, filterVisibleAnnotations, groupAnnotationsByPage, isAnnotationVisible, listComments, resizeHandleAtPoint, resizeRect, translatePoints, translateRect } from '@/lib/pdf/annotationGeometry';
import type { ResizeHandle } from '@/lib/pdf/annotationGeometry';
import { annotationAtPoint } from '@/lib/pdf/annotationHitTest';
import { rangeToNormalizedQuads } from '@/lib/pdf/pdfTextRange';
import { getPageTextIndex } from '@/lib/pdf/pdfPageTextIndex';
import { matchToQuads } from '@/lib/pdf/textLayerGeometry';
import { PdfMarkupContext, type PdfMarkupContextValue } from '@/lib/pdf/PdfMarkupContext';

// -- Type Imports --
import type { NoteHostContext } from '@/lib/portals/linkTarget';
import type { PdfStore, PdfTool, SearchMatch } from '@/lib/stores/pdfStore';
import { HIGHLIGHT_ALPHA } from '@/lib/stores/pdfStore';
import type { PdfAnnotation, PdfComment, PdfHighlight, PdfInk, PdfRect, PdfTextHighlight } from '@/lib/types/pdfAnnotation';
import type { PDFDocumentProxy } from 'pdfjs-dist';

/*
 * The PDF tab surface: a read-only, continuous vertical reader. It reads the ACTIVE PDF instance
 * (never the character context) and only mounts when a pdf tab is active. The instance is already
 * hydrated by the open/activate path, so this surface just reflects its status: a centered loading
 * or error state, or the scrolling page list. There is no edit buffer and nothing to flush.
 */

/** The 100% readable width: a page renders at most this wide at zoom 1, so it never blows up on an ultra-wide panel. */
const READABLE_MAX_WIDTH = 1000;

/** After a zoom stops changing for this long, the pages re-rasterize at the new width (a CSS zoom covers the gap).
 *  Lenient enough that several quick wheel bursts read as one gesture instead of settling between each. */
const RENDER_SETTLE_MS = 400;

/** Stable empty slice for a page with no annotations, so an unmarked page's prop ref never changes across zooms. */
const NO_ANNOTATIONS: PdfAnnotation[] = [];

/** Stable empty slice for a page with no search matches, so an unmatched page's prop ref stays put across zooms. */
const NO_MATCHES: SearchMatch[] = [];

/** The eraser's grab floor in box px; per-ink reach grows past it with the stroke width. */
const ERASER_HIT_FLOOR = 8;

/** The select tool's grab floor in box px; a thin stroke stays clickable, matching the eraser's reach. */
const SELECT_HIT_FLOOR = 8;

/** How near a handle center a click must land to grab it, in box px. */
const RESIZE_HANDLE_TOLERANCE = 10;

/** The smallest a resized rect may shrink to, as a page fraction; keeps a mark grabbable after a hard drag. */
const MIN_RESIZE_NORM = { w: 0.01, h: 0.01 };

/** How long a jumped-to comment flashes; matches the flash keyframe so the box fades out as the timer clears it. */
const FLASH_MS = 1500;

export function PdfView() {
   const store = useActivePdfInstance();
   if (!store) return null;
   return <PdfSurface store={store} />;
}

function PdfSurface({ store }: { store: PdfStore }) {
   const status = useStore(store, (state) => state.status);
   const doc = useStore(store, (state) => state.doc);
   const proxy = useStore(store, (state) => state.proxy);

   if (status === 'error') return <PdfCenteredState kind="error" />;
   if (status === 'placeholder') return <PdfRepairState store={store} />;
   if (status !== 'ready' || !proxy || !doc) return <PdfCenteredState kind="loading" />;

   return (
      <PdfReader
         store={store}
         proxy={proxy}
         pageCount={doc.pageCount}
         // Remount per document so the page list, observers, and canvases never cross PDFs.
         key={doc.id}
      />
   );
}

interface PdfReaderProps {
   store: PdfStore;
   proxy: PDFDocumentProxy;
   pageCount: number;
}

function PdfReader({ store, proxy, pageCount }: PdfReaderProps) {
   const scrollRef = useRef<HTMLDivElement>(null);
   const measureRef = useRef<HTMLDivElement>(null);
   const currentPage = useStore(store, (state) => state.currentPage);
   const jumpSeq = useStore(store, (state) => state.jumpSeq);
   const annotations = useStore(store, (state) => state.doc?.annotations);
   const markupMode = useStore(store, (state) => state.markupMode);
   const tool = useStore(store, (state) => state.tool);
   const penColor = useStore(store, (state) => state.penColor);
   const penWidth = useStore(store, (state) => state.penWidth);
   const highlightColor = useStore(store, (state) => state.highlightColor);
   const highlightMode = useStore(store, (state) => state.highlightMode);
   const commentColor = useStore(store, (state) => state.commentColor);
   const commentsPanelOpen = useStore(store, (state) => state.commentsPanelOpen);
   const navPanelOpen = useStore(store, (state) => state.navPanelOpen);
   const navPanelTab = useStore(store, (state) => state.navPanelTab);
   const annotationVisibility = useStore(store, (state) => state.annotationVisibility);
   const searchOpen = useStore(store, (state) => state.searchOpen);
   const searchQuery = useStore(store, (state) => state.searchQuery);
   const searchMatches = useStore(store, (state) => state.searchMatches);
   const searchActiveIndex = useStore(store, (state) => state.searchActiveIndex);
   const searchStatus = useStore(store, (state) => state.searchStatus);
   const searchScanned = useStore(store, (state) => state.searchScanned);
   const { setPage, setMarkupMode, setTool, setPenColor, setPenWidth, setHighlightColor, setHighlightMode, setCommentColor, setCommentsPanelOpen, toggleCommentsPanel, setNavPanelOpen, toggleNavPanel, setNavPanelTab, setAnnotationTypeVisible, setAllAnnotationsVisible, openSearch, closeSearch, setSearchQuery, nextMatch, prevMatch } = store.getState().actions;

   // The comment card highlighted + scrolled-to in the panel; ephemeral UI, reset on remount (a tab switch).
   const [focusedCommentId, setFocusedCommentId] = useState<string | null>(null);
   // The comment card in edit mode, or null; ephemeral UI. At most one card edits at a time.
   const [editingCommentId, setEditingCommentId] = useState<string | null>(null);

   // The transient flash after a jump; ephemeral, reset on remount.
   const [flashCommentId, setFlashCommentId] = useState<string | null>(null);
   const flashTimer = useRef<number | null>(null);

   // The selected mark; ephemeral UI, reset on remount. A ref mirror lets the move / recolor / delete handlers
   // read it while staying referentially stable (they never swap mid-gesture).
   const [selectedId, setSelectedId] = useState<string | null>(null);
   const selectedIdRef = useRef(selectedId);
   useEffect(() => {
      selectedIdRef.current = selectedId;
   }, [selectedId]);

   // Mints a pen ink from a finished gesture and hands it to the autosave path. Reads the live pen color at
   // commit so the handler stays stable (never swapped mid-stroke); `store` is the only dependency.
   const commitInk = useCallback(
      (pageNumber: number, normalizedPoints: number[], normalizedWidth: number) => {
         const ink: PdfInk = {
            kind: 'ink',
            id: cuid(),
            page: pageNumber,
            color: store.getState().penColor,
            width: normalizedWidth,
            points: normalizedPoints,
            brush: 'pen',
            createdAt: Date.now(),
         };
         const actions = store.getState().actions;
         actions.beginHistory();
         actions.addAnnotation(ink);
         actions.commitHistory();
      },
      [store],
   );

   // Erases every annotation under a client point on one page. The point converts to UNZOOMED box px via the
   // zoomed rect fraction, so the hit-test runs zoom-independently.
   const eraseAt = useCallback(
      (pageNumber: number, rect: DOMRect, boxW: number, boxH: number, clientX: number, clientY: number) => {
         const marks = store.getState().doc?.annotations;
         if (!marks) return;
         const visibility = store.getState().annotationVisibility;
         const px = ((clientX - rect.left) / rect.width) * boxW;
         const py = ((clientY - rect.top) / rect.height) * boxH;
         // A hidden kind is off the page visually, so it's off the eraser too - can't erase what you can't see.
         const onPage = Object.values(marks).filter((mark) => mark.page === pageNumber && isAnnotationVisible(mark, visibility));
         const hits = annotationAtPoint(onPage, px, py, boxW, boxH, ERASER_HIT_FLOOR);
         const { removeAnnotation } = store.getState().actions;
         for (const id of hits) removeAnnotation(id);
      },
      [store],
   );

   // Mints a highlight from a finished rect drag. Reads the live fill color at commit so the handler stays stable.
   const commitHighlight = useCallback(
      (pageNumber: number, rect: PdfRect) => {
         const highlight: PdfHighlight = {
            kind: 'highlight',
            id: cuid(),
            page: pageNumber,
            color: store.getState().highlightColor,
            alpha: HIGHLIGHT_ALPHA,
            rect,
            createdAt: Date.now(),
         };
         const actions = store.getState().actions;
         actions.beginHistory();
         actions.addAnnotation(highlight);
         actions.commitHistory();
      },
      [store],
   );

   // Mints an empty comment from a finished rect drag, opens the panel, and drops the new card into edit so the
   // body is authored on the side at once. The history checkpoint stays OPEN until the edit ends: a bodied
   // comment commits one undo step, an abandoned empty one cancels it (see endEdit), so a stray marquee never
   // leaves a phantom step.
   const commitComment = useCallback(
      (pageNumber: number, rect: PdfRect) => {
         const id = cuid();
         const comment: PdfComment = {
            kind: 'comment',
            id,
            page: pageNumber,
            color: store.getState().commentColor,
            body: '',
            rect,
            createdAt: Date.now(),
         };
         const actions = store.getState().actions;
         actions.beginHistory();
         actions.addAnnotation(comment);
         actions.setCommentsPanelOpen(true);
         setFocusedCommentId(id);
         setEditingCommentId(id);
      },
      [store],
   );

   // The topmost comment under a client point on one page, or null. Mirrors eraseAt's zoom-independent conversion,
   // but filters to comments so a click reopens only a note (never an ink/highlight underneath).
   const commentAtPoint = useCallback(
      (pageNumber: number, rect: DOMRect, boxW: number, boxH: number, clientX: number, clientY: number) => {
         const marks = store.getState().doc?.annotations;
         if (!marks) return null;
         // Hidden comments don't reopen on click - the mark is invisible, so its region is inert.
         if (!store.getState().annotationVisibility.comment) return null;
         const px = ((clientX - rect.left) / rect.width) * boxW;
         const py = ((clientY - rect.top) / rect.height) * boxH;
         const comments = Object.values(marks).filter((mark) => mark.page === pageNumber && mark.kind === 'comment');
         const hits = annotationAtPoint(comments, px, py, boxW, boxH, 0);
         return hits[0] ?? null;
      },
      [store],
   );

   // Opens the panel and highlights a comment's card. A doc marker/region click routes here (the read/edit
   // home is the side, never an overlay).
   const focusComment = useCallback(
      (id: string) => {
         store.getState().actions.setCommentsPanelOpen(true);
         setFocusedCommentId(id);
      },
      [store],
   );

   const startEdit = useCallback((id: string) => {
      setEditingCommentId(id);
      setFocusedCommentId(id);
   }, []);

   // End-of-edit (blur / Done): an empty (never-authored or cleared) comment self-deletes, so a stray marquee
   // leaves no ghost note. A freshly created comment holds an open history checkpoint (commitComment) - authored,
   // it commits to one undo step; abandoned empty, it cancels so add-then-remove leaves no trace. A reopened
   // comment has no open checkpoint, so commit/cancel are no-ops (body edits ride native undo only).
   const endEdit = useCallback(
      (id: string) => {
         const actions = store.getState().actions;
         const comment = store.getState().doc?.annotations?.[id];
         if (comment && comment.kind === 'comment' && comment.body.trim() === '') {
            actions.removeAnnotation(id);
            actions.cancelHistory();
         } else {
            actions.commitHistory();
         }
         setEditingCommentId((current) => (current === id ? null : current));
      },
      [store],
   );

   const setCommentBody = useCallback(
      (id: string, body: string) => store.getState().actions.updateAnnotation(id, { body }),
      [store],
   );

   // History brackets for the eraser scrub, which mutates the store across a drag (unlike the atomic add
   // handlers that begin/commit inline). Stable wrappers so an in-progress gesture never sees them swapped.
   const beginHistory = useCallback(() => store.getState().actions.beginHistory(), [store]);
   const commitHistory = useCallback(() => store.getState().actions.commitHistory(), [store]);

   const deleteComment = useCallback(
      (id: string) => {
         const actions = store.getState().actions;
         actions.beginHistory();
         actions.removeAnnotation(id);
         actions.commitHistory();
         setEditingCommentId((current) => (current === id ? null : current));
         setFocusedCommentId((current) => (current === id ? null : current));
      },
      [store],
   );

   const select = useCallback((id: string | null) => setSelectedId(id), []);

   // Leaving the select tool (or turning markup off) drops the current selection, so a mark never stays
   // highlighted - or deletable via the Delete key - under another tool or back in read mode.
   const handleToolChange = useCallback(
      (next: PdfTool) => {
         if (next !== 'select') setSelectedId(null);
         setTool(next);
      },
      [setTool],
   );

   const toggleMarkup = useCallback(() => {
      setSelectedId(null);
      setMarkupMode(store.getState().markupMode === 'read' ? 'markup' : 'read');
   }, [setMarkupMode, store]);

   // The topmost mark of any kind under a client point on one page, or null. Mirrors eraseAt's zoom-independent
   // conversion (fraction kills the zoom, boxW rescales), grabbing across every kind so any mark is selectable.
   const selectAt = useCallback(
      (pageNumber: number, rect: DOMRect, boxW: number, boxH: number, clientX: number, clientY: number) => {
         const marks = store.getState().doc?.annotations;
         if (!marks) return null;
         const visibility = store.getState().annotationVisibility;
         const px = ((clientX - rect.left) / rect.width) * boxW;
         const py = ((clientY - rect.top) / rect.height) * boxH;
         // A hidden mark isn't selectable - it can't be grabbed, moved, or deleted while out of view.
         const onPage = Object.values(marks).filter((mark) => mark.page === pageNumber && isAnnotationVisible(mark, visibility));
         const hits = annotationAtPoint(onPage, px, py, boxW, boxH, SELECT_HIT_FLOOR);
         return hits[0] ?? null;
      },
      [store],
   );

   // Moves the selected mark by an incremental normalized delta, clamped so its bounds stay on the page. The
   // interaction layer brackets the whole drag with begin/commit, so this only mutates. A fully-clamped step
   // (dragging into an edge) writes nothing, so it never swaps the map or leaves a phantom undo step.
   const translateSelected = useCallback(
      (dnx: number, dny: number) => {
         const id = selectedIdRef.current;
         if (!id) return;
         const mark = store.getState().doc?.annotations?.[id];
         if (!mark) return;
         // A text highlight is frozen to its text (no points, no rect); it never moves.
         if (mark.kind === 'textHighlight') return;
         const { dx, dy } = clampTranslation(annotationBounds(mark), dnx, dny);
         if (dx === 0 && dy === 0) return;
         const { updateAnnotation } = store.getState().actions;
         if (mark.kind === 'ink') updateAnnotation(id, { points: translatePoints(mark.points, dx, dy) });
         else updateAnnotation(id, { rect: translateRect(mark.rect, dx, dy) });
      },
      [store],
   );

   // The resize handle under a client point, or null. Only a selected rect kind (highlight/comment) on the
   // hovered page yields one - ink has no area, and a mark on another page must not be grabbed through this page's
   // box. Mirrors selectAt's zoom-independent conversion (fraction kills the zoom, boxW rescales).
   const resizeHandleAt = useCallback(
      (pageNumber: number, rect: DOMRect, boxW: number, boxH: number, clientX: number, clientY: number) => {
         const id = selectedIdRef.current;
         if (!id) return null;
         const mark = store.getState().doc?.annotations?.[id];
         // Only a rect kind resizes; ink has no area and a text highlight is frozen to its text.
         if (!mark || mark.kind === 'ink' || mark.kind === 'textHighlight' || mark.page !== pageNumber) return null;
         const px = ((clientX - rect.left) / rect.width) * boxW;
         const py = ((clientY - rect.top) / rect.height) * boxH;
         return resizeHandleAtPoint(annotationBounds(mark), boxW, boxH, px, py, RESIZE_HANDLE_TOLERANCE);
      },
      [store],
   );

   // Reshapes the selected rect kind by an incremental normalized delta. The interaction layer brackets the whole
   // drag with begin/commit, so this only mutates. Ink has no area and is skipped; the rect is kept on-page and
   // above the size floor by resizeRect itself.
   const resizeSelected = useCallback(
      (handle: ResizeHandle, dnx: number, dny: number) => {
         const id = selectedIdRef.current;
         if (!id) return;
         const mark = store.getState().doc?.annotations?.[id];
         // Only a rect kind reshapes; ink and text highlights carry no rect.
         if (!mark || (mark.kind !== 'highlight' && mark.kind !== 'comment')) return;
         store.getState().actions.updateAnnotation(id, { rect: resizeRect(mark.rect, handle, dnx, dny, MIN_RESIZE_NORM) });
      },
      [store],
   );

   // Recolors the selected mark in one undo step; bound to the toolbar's color control, which fires on close.
   const recolorSelected = useCallback(
      (color: string) => {
         const id = selectedIdRef.current;
         if (!id) return;
         const actions = store.getState().actions;
         actions.beginHistory();
         actions.updateAnnotation(id, { color });
         actions.commitHistory();
      },
      [store],
   );

   // Scrolls to a comment's page (via the existing jumpSeq path), selects its card, and flashes its region. The
   // timer is guarded against a rapid re-jump (clear the prior one) and against unmount (cleared below).
   const jumpToComment = useCallback(
      (comment: PdfComment) => {
         store.getState().actions.requestPage(comment.page);
         setFocusedCommentId(comment.id);
         setFlashCommentId(comment.id);
         if (flashTimer.current !== null) clearTimeout(flashTimer.current);
         flashTimer.current = window.setTimeout(() => {
            setFlashCommentId(null);
            flashTimer.current = null;
         }, FLASH_MS);
      },
      [store],
   );

   useEffect(() => () => {
      if (flashTimer.current !== null) clearTimeout(flashTimer.current);
   }, []);

   // Comment-body links: this surface is a TAB host, so a `cotm://` chip routes pdf/note/board/character/external
   // exactly like a note link. Comments carry no `#section`, so the same-note scroll is a no-op.
   const linkHost = useMemo<NoteHostContext>(() => ({ kind: 'tab' }), []);
   const scrollToSection = useCallback(() => {}, []);
   const onLinkActivate = useNoteLinkActivation(linkHost, scrollToSection);

   // Applying a shared markup file onto this open pdf: the palette command opens the picker (via the store
   // bridge), and the Add/Replace choice lands as one undo step.
   const { fileInputRef: markupInputRef, onFileChange: onMarkupFileChange, pending: markupApplyPending, apply: applyMarkupChoice, cancel: cancelMarkupApply } = usePdfMarkupApply(store);

   // The live text selection over the pages, tracked only in read mode; drives the floating action bar.
   const textSelection = usePdfTextSelection(scrollRef, markupMode === 'read');

   // Turns the live selection into text highlights: one per covered page box, all in one undo step. The
   // range's client rects are normalized against each mounted page box; a rect lands on the page whose box
   // holds its center, so a selection spanning several pages splits into one highlight per page. Every
   // highlight on a multi-page selection carries the FULL selected text as its quote (multi-page
   // quote-splitting is out of scope); a single-page selection - the common case - carries the exact quote.
   const highlightSelection = useCallback(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
      const scroller = scrollRef.current;
      if (!scroller) return;
      const range = selection.getRangeAt(0);
      const quote = selection.toString();
      const created: PdfTextHighlight[] = [];
      const color = store.getState().highlightColor;
      for (const box of scroller.querySelectorAll<HTMLElement>('[data-page]')) {
         const page = Number(box.dataset.page);
         if (!page) continue;
         const quads = rangeToNormalizedQuads(range, box).filter((quad) => {
            const cx = quad.x + quad.w / 2;
            const cy = quad.y + quad.h / 2;
            return cx >= 0 && cx <= 1 && cy >= 0 && cy <= 1;
         });
         if (quads.length === 0) continue;
         created.push({ kind: 'textHighlight', id: cuid(), page, color, alpha: HIGHLIGHT_ALPHA, quads, text: quote, createdAt: Date.now() });
      }
      if (created.length === 0) return;
      const actions = store.getState().actions;
      actions.beginHistory();
      for (const mark of created) actions.addAnnotation(mark);
      actions.commitHistory();
      window.getSelection()?.removeAllRanges();
   }, [store]);

   // The Text highlighter is drag-to-release: while it is armed, a pointer release over the reader mints the
   // highlight from the live selection. `highlightSelection` no-ops on a collapsed or out-of-reader selection,
   // so a stray click is safe. The floating bar stays hidden in markup mode - there's no button to press here.
   useEffect(() => {
      if (!(markupMode === 'markup' && tool === 'highlight' && highlightMode === 'text')) return;
      const scroller = scrollRef.current;
      if (!scroller) return;
      const onMouseUp = () => highlightSelection();
      scroller.addEventListener('mouseup', onMouseUp);
      return () => scroller.removeEventListener('mouseup', onMouseUp);
   }, [markupMode, tool, highlightMode, highlightSelection]);

   const markup = useMemo<PdfMarkupContextValue>(
      () => ({
         mode: markupMode,
         tool,
         highlightMode,
         penColor,
         penWidth,
         highlightColor,
         commentColor,
         commitInk,
         commitHighlight,
         commitComment,
         eraseAt,
         commentAtPoint,
         focusComment,
         setCommentBody,
         deleteComment,
         selectedId,
         flashCommentId,
         focusedCommentId,
         select,
         selectAt,
         translateSelected,
         resizeHandleAt,
         resizeSelected,
         beginHistory,
         commitHistory,
      }),
      [markupMode, tool, highlightMode, penColor, penWidth, highlightColor, commentColor, commitInk, commitHighlight, commitComment, eraseAt, commentAtPoint, focusComment, setCommentBody, deleteComment, selectedId, flashCommentId, focusedCommentId, select, selectAt, translateSelected, resizeHandleAt, resizeSelected, beginHistory, commitHistory],
   );

   // Grouped per page after dropping hidden kinds, so the layers paint only visible marks (no per-layer change).
   // Referentially stable while `annotations` and `annotationVisibility` both hold - so a wheel-zoom (which
   // touches neither) keeps every page's slice ref and the page memos survive; a visibility toggle re-groups.
   const byPage = useMemo(() => groupAnnotationsByPage(filterVisibleAnnotations(annotations, annotationVisibility)), [annotations, annotationVisibility]);

   // Every comment across the document, ordered for the panel; re-refs only when a mark is added or removed.
   const comments = useMemo(() => listComments(annotations), [annotations]);

   // Matches bucketed per page (like byPage), so each page gets only its own slice; unmatched pages fall to the
   // stable NO_MATCHES ref below, so a wheel-zoom never re-renders 491 pages. Re-refs only as the scan grows.
   const searchByPage = useMemo(() => {
      const map = new Map<number, SearchMatch[]>();
      for (const match of searchMatches) {
         const bucket = map.get(match.page);
         if (bucket) bucket.push(match);
         else map.set(match.page, [match]);
      }
      return map;
   }, [searchMatches]);

   // The active match object (shared by reference with its per-page slice), or null when none is active.
   const activeMatch = searchActiveIndex >= 0 ? searchMatches[searchActiveIndex] ?? null : null;

   const toggleSearch = useCallback(() => {
      if (store.getState().searchOpen) closeSearch();
      else openSearch();
   }, [store, closeSearch, openSearch]);

   // The selected mark's own ink, or null when nothing is selected; drives the toolbar's recolor swatch.
   const selectedColor = selectedId ? annotations?.[selectedId]?.color ?? null : null;

   // The reading position to restore on (re)mount: the page the instance kept, frozen at mount so live
   // scrolling never moves the target. Seeded into the visible set so its canvas renders from the first
   // frame instead of flashing white until the observer catches up.
   const [restoreToPage] = useState(currentPage);
   const measuredWidth = usePdfContainerWidth(measureRef);
   const defaultAspect = usePdfDefaultAspect(proxy);
   const { visible, registerPage } = useVisiblePages(scrollRef, pageCount, setPage, restoreToPage);

   const baseWidth = Math.min(measuredWidth, READABLE_MAX_WIDTH);
   const { zoom, effectivePageWidth, zoomIn, zoomOut, wheelZoom, resetZoom, fitWidth, fitPage } = usePdfZoom(store, {
      scrollRef,
      measuredWidth,
      baseWidth,
      pageAspect: defaultAspect,
   });

   const pages = useMemo(() => Array.from({ length: pageCount }, (_, index) => index + 1), [pageCount]);

   // The pages render (and their boxes lay out) at the SETTLED width; the live delta rides a cheap CSS zoom on
   // the column, so a rapid wheel-zoom scales instantly - no re-rendering 491 pages or re-rasterizing per tick.
   const renderWidth = useSettledWidth(effectivePageWidth, RENDER_SETTLE_MS);
   const columnZoom = renderWidth > 0 ? effectivePageWidth / renderWidth : 1;

   // Scrolls a page's box to the top of the scroller. Shared by mount-restore and the toolbar jump / prev / next.
   const scrollToPage = useCallback(
      (page: number) => {
         const scroller = scrollRef.current;
         if (!scroller) return;
         const clamped = Math.min(Math.max(page, 1), pageCount);
         const box = scroller.querySelector<HTMLElement>(`[data-page="${clamped}"]`);
         if (box) scroller.scrollTop += box.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      },
      [pageCount],
   );

   const jumpToPage = useCallback(
      (page: number) => {
         const clamped = Math.min(Math.max(page, 1), pageCount);
         scrollToPage(clamped);
         setPage(clamped);
      },
      [pageCount, scrollToPage, setPage],
   );

   // Scrolls a match into the upper third of the viewport: land its page top first, then resolve the match's
   // first-quad Y (cached index, so fast) and offset into the box. The box always reserves height, so the math
   // is valid the moment the page mounts.
   const scrollToMatch = useCallback(
      async (match: SearchMatch) => {
         scrollToPage(match.page);
         setPage(match.page);
         const scroller = scrollRef.current;
         if (!scroller) return;
         try {
            const index = await getPageTextIndex(proxy, match.page);
            const first = matchToQuads(index, match.start, match.length)[0];
            if (!first) return;
            const box = scroller.querySelector<HTMLElement>(`[data-page="${match.page}"]`);
            if (!box) return;
            const boxHeight = box.getBoundingClientRect().height;
            scroller.scrollTop += first.y * boxHeight - scroller.clientHeight * 0.3;
         } catch {
            // No text index for the page: the page-top scroll already landed.
         }
      },
      [proxy, scrollToPage, setPage],
   );

   // The content point at the viewport center, as a fraction of the scroll extent - tracked live so a zoom holds
   // it in place instead of snapping to a page edge. Scale-invariant, so it survives the width change.
   const viewportCenter = useRef({ y: 0, x: 0.5 });
   useEffect(() => {
      const scroller = scrollRef.current;
      if (!scroller) return;
      const track = () => {
         if (scroller.scrollHeight > 0) viewportCenter.current.y = (scroller.scrollTop + scroller.clientHeight / 2) / scroller.scrollHeight;
         if (scroller.scrollWidth > 0) viewportCenter.current.x = (scroller.scrollLeft + scroller.clientWidth / 2) / scroller.scrollWidth;
      };
      scroller.addEventListener('scroll', track, { passive: true });
      return () => scroller.removeEventListener('scroll', track);
   }, []);

   // Keep the reading position, in priority order, once the pages have a height (width-guarded at the top, so a
   // jump requested before the pages lay out still lands the moment they do):
   //   1. An explicit page jump (a `requestPage`, which bumps `jumpSeq`) wins - scroll to it. Covers a page link
   //      into an already-open reader AND a just-opened one whose `requestPage` raced the mount.
   //   2. First pass: restore the mount page.
   //   3. A width change (zoom / settle re-layout / resize): hold the viewport-center content in place - no snap.
   // A layout effect (before paint) keeps it flicker-free.
   const restored = useRef(false);
   const seenJump = useRef(jumpSeq);
   useLayoutEffect(() => {
      if (effectivePageWidth <= 0 || renderWidth <= 0) return;
      const scroller = scrollRef.current;
      if (!scroller) return;
      if (jumpSeq !== seenJump.current) {
         seenJump.current = jumpSeq;
         restored.current = true;
         scrollToPage(store.getState().currentPage);
         return;
      }
      if (!restored.current) {
         restored.current = true;
         if (restoreToPage > 1) scrollToPage(restoreToPage);
         return;
      }
      const { y, x } = viewportCenter.current;
      scroller.scrollTop = Math.max(0, y * scroller.scrollHeight - scroller.clientHeight / 2);
      scroller.scrollLeft = Math.max(0, x * scroller.scrollWidth - scroller.clientWidth / 2);
   }, [effectivePageWidth, renderWidth, jumpSeq, restoreToPage, scrollToPage, store]);

   // Ctrl/Cmd + wheel zooms (mirrors the character sheet). Native + non-passive so it can preventDefault ONLY
   // when the modifier is held - a plain wheel still scrolls the reader.
   useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;
      const onWheel = (event: WheelEvent) => {
         if (!event.ctrlKey && !event.metaKey) return;
         event.preventDefault();
         wheelZoom(event.deltaY < 0 ? 1 : -1);
      };
      el.addEventListener('wheel', onWheel, { passive: false });
      return () => el.removeEventListener('wheel', onWheel);
   }, [wheelZoom]);

   // Reader-scoped keys: +/= zoom in, - out, 0 reset, and Delete/Backspace removes the selected mark. The
   // listener lives only while this surface is mounted (it mounts only when a pdf tab is active), and ignores
   // keys typed into the page input or the comment editor.
   useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
         if (event.ctrlKey || event.metaKey || event.altKey) return;
         const target = event.target as HTMLElement | null;
         if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
         if (event.key === 'Delete' || event.key === 'Backspace') {
            const id = selectedIdRef.current;
            if (store.getState().markupMode !== 'markup' || !id) return;
            const actions = store.getState().actions;
            actions.beginHistory();
            actions.removeAnnotation(id);
            actions.commitHistory();
            setSelectedId(null);
            event.preventDefault();
            return;
         }
         if (event.key === '+' || event.key === '=') zoomIn();
         else if (event.key === '-') zoomOut();
         else if (event.key === '0') resetZoom();
         else return;
         event.preventDefault();
      };
      document.addEventListener('keydown', onKeyDown);
      return () => document.removeEventListener('keydown', onKeyDown);
   }, [zoomIn, zoomOut, resetZoom, store]);

   // Scroll the active match into view whenever it changes. Reads the match off the store (not the deps) so a
   // scan growing the match list mid-search never re-triggers a scroll - only a cursor move does.
   useEffect(() => {
      if (searchActiveIndex < 0) return;
      const match = store.getState().searchMatches[searchActiveIndex];
      if (match) void scrollToMatch(match);
   }, [searchActiveIndex, scrollToMatch, store]);

   // Ctrl/Cmd + F opens the find bar (capture phase, so it beats the browser's own find). Mounted only while a
   // pdf tab is - this surface only mounts then. Left alone when focus is inside a dialog over the reader, so a
   // dialog's own find isn't stolen. Separate from the reader keys above, which bail on any modifier.
   useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
         if (event.key !== 'f' || event.altKey || !(event.ctrlKey || event.metaKey)) return;
         const active = document.activeElement;
         if (active && active.closest('[role="dialog"]')) return;
         event.preventDefault();
         store.getState().actions.openSearch();
      };
      document.addEventListener('keydown', onKeyDown, true);
      return () => document.removeEventListener('keydown', onKeyDown, true);
   }, [store]);

   return (
      <PdfMarkupContext.Provider value={markup}>
         <div className="absolute inset-0 bg-muted/40">
            {/* Scroller + panel share a flex row so the panel PUSHES the pages (the scroller shrinks and the
                probe inside it re-measures, re-fitting the pages) rather than covering them. */}
            <div className="flex h-full">
               {/* The nav panel mirrors the comments panel but on the LEFT: its width animates 0 <-> w-80 so it
                   slides the pages over rather than snapping; its content is pinned left and clipped. `inert`
                   while closed keeps the still-mounted panel out of tab order. */}
               <div
                  className={cn('relative h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-out', navPanelOpen ? 'w-80' : 'w-0')}
                  inert={!navPanelOpen}
               >
                  <div className="absolute inset-y-0 left-0 w-80">
                     <PdfNavPanel
                        proxy={proxy}
                        pageCount={pageCount}
                        currentPage={currentPage}
                        defaultAspect={defaultAspect}
                        tab={navPanelTab}
                        onTabChange={setNavPanelTab}
                        onJump={jumpToPage}
                        onClose={() => setNavPanelOpen(false)}
                     />
                  </div>
               </div>
               <div ref={scrollRef} className="min-w-0 flex-1 overflow-auto overscroll-contain bg-background px-4 py-6">
                  {/* Zero-height full-width probe: measures the scroller's content width independent of the page
                      column, which can grow wider than the container when zoomed. */}
                  <div ref={measureRef} className="h-0 w-full" />
                  {/* The live zoom rides a CSS `zoom` on the column (cheap, one element); the pages themselves stay at
                      the settled render width, so a wheel-zoom scales the whole column instantly and re-rasterizes once. */}
                  <div className="mx-auto flex w-fit min-w-full flex-col items-center gap-4" style={{ zoom: columnZoom }}>
                     {renderWidth > 0 &&
                        pages.map((pageNumber) => (
                           <PdfPageCanvas
                              key={pageNumber}
                              proxy={proxy}
                              pageNumber={pageNumber}
                              width={renderWidth}
                              defaultAspect={defaultAspect}
                              isVisible={visible.has(pageNumber)}
                              annotations={byPage.get(pageNumber) ?? NO_ANNOTATIONS}
                              searchMatches={searchByPage.get(pageNumber) ?? NO_MATCHES}
                              activeSearchMatch={activeMatch?.page === pageNumber ? activeMatch : null}
                              registerPage={registerPage}
                           />
                        ))}
                  </div>
               </div>
               {/* The panel width animates 0 <-> w-88 so it slides the pages over rather than snapping; its content
                   is pinned right and clipped, so it reveals from the edge. `inert` while closed keeps the still-mounted
                   list out of tab order. */}
               <div
                  className={cn('relative h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-out', commentsPanelOpen ? 'w-88' : 'w-0')}
                  inert={!commentsPanelOpen}
               >
                  <div className="absolute inset-y-0 right-0 w-88">
                     <PdfCommentsPanel
                        comments={comments}
                        focusedCommentId={focusedCommentId}
                        editingCommentId={editingCommentId}
                        onJump={jumpToComment}
                        onStartEdit={startEdit}
                        onChangeBody={setCommentBody}
                        onEndEdit={endEdit}
                        onDelete={deleteComment}
                        onLinkActivate={onLinkActivate}
                        onClose={() => setCommentsPanelOpen(false)}
                     />
                  </div>
               </div>
            </div>
            {/* Floating find bar over the top-center of the visible pages; mounted only while search is open. */}
            {searchOpen ? (
               <PdfFindBar
                  navPanelOpen={navPanelOpen}
                  commentsPanelOpen={commentsPanelOpen}
                  query={searchQuery}
                  status={searchStatus}
                  scanned={searchScanned}
                  pageCount={pageCount}
                  matchCount={searchMatches.length}
                  activeIndex={searchActiveIndex}
                  onQueryChange={setSearchQuery}
                  onNext={nextMatch}
                  onPrev={prevMatch}
                  onClose={closeSearch}
               />
            ) : null}
            {/* Floating toolbars: when a side panel is open, shrink this positioned wrapper from that edge by the
                panel width (right for comments, left for nav) so the centered pills stay over the VISIBLE pages. It
                must be `left`/`right` (the wrapper's own edges), not padding - an absolute child's containing block
                is the padding box, so padding wouldn't move it. */}
            <div className={cn('pointer-events-none absolute bottom-0 top-0 transition-[left,right] duration-200 ease-out', navPanelOpen ? 'left-80' : 'left-0', commentsPanelOpen ? 'right-88' : 'right-0')}>
               {markupMode === 'markup' ? (
                  <PdfMarkupToolbar
                     tool={tool}
                     onToolChange={handleToolChange}
                     penColor={penColor}
                     onPenColorChange={setPenColor}
                     penWidth={penWidth}
                     onPenWidthChange={setPenWidth}
                     highlightColor={highlightColor}
                     onHighlightColorChange={setHighlightColor}
                     highlightMode={highlightMode}
                     onHighlightModeChange={setHighlightMode}
                     commentColor={commentColor}
                     onCommentColorChange={setCommentColor}
                     selectedColor={selectedColor}
                     onRecolorSelected={recolorSelected}
                  />
               ) : null}
               <PdfToolbar
                  current={currentPage}
                  total={pageCount}
                  zoom={zoom}
                  navPanelOpen={navPanelOpen}
                  onToggleNav={toggleNavPanel}
                  searchOpen={searchOpen}
                  onToggleSearch={toggleSearch}
                  markupMode={markupMode}
                  onToggleMarkup={toggleMarkup}
                  commentsPanelOpen={commentsPanelOpen}
                  onToggleComments={toggleCommentsPanel}
                  annotationVisibility={annotationVisibility}
                  onSetTypeVisible={setAnnotationTypeVisible}
                  onSetAllVisible={setAllAnnotationsVisible}
                  onPrev={() => jumpToPage(currentPage - 1)}
                  onNext={() => jumpToPage(currentPage + 1)}
                  onJump={jumpToPage}
                  onZoomIn={zoomIn}
                  onZoomOut={zoomOut}
                  onResetZoom={resetZoom}
                  onFitWidth={fitWidth}
                  onFitPage={fitPage}
               />
            </div>
            {/* Markup-apply plumbing: a hidden picker the palette command opens, plus the Add/Replace dialog. */}
            <input ref={markupInputRef} type="file" accept=".cotm" className="hidden" onChange={onMarkupFileChange} />
            <PdfMarkupApplyDialog
               pending={markupApplyPending}
               onAdd={() => applyMarkupChoice('add')}
               onReplace={() => applyMarkupChoice('replace')}
               onCancel={cancelMarkupApply}
            />
            {/* Floating action bar over a live read-mode selection; fixed in viewport coords (the rect is too). */}
            {markupMode === 'read' && textSelection ? <PdfSelectionActionBar rect={textSelection.rect} text={textSelection.text} onHighlight={highlightSelection} /> : null}
         </div>
      </PdfMarkupContext.Provider>
   );
}

/** The centered loading / error state, filling the tab content area with themed chrome. */
function PdfCenteredState({ kind }: { kind: 'loading' | 'error' }) {
   const { t } = useTranslation();

   if (kind === 'error') {
      return (
         <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background px-6 text-center">
            <FileWarning className="h-10 w-10 text-muted-foreground opacity-50" />
            <div className="space-y-1">
               <p className="text-sm font-medium text-foreground">{t('PdfView.errorTitle')}</p>
               <p className="text-sm text-muted-foreground">{t('PdfView.errorBody')}</p>
            </div>
         </div>
      );
   }

   return (
      <div className="absolute inset-0 flex items-center justify-center bg-background text-muted-foreground">
         <MistSpinner variant="logo" size={128} tip={t('PdfView.loading')} label={t('PdfView.loading')} />
      </div>
   );
}
