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

// -- Local Imports --
import { usePdfContainerWidth } from './usePdfContainerWidth';
import { usePdfDefaultAspect } from './usePdfDefaultAspect';
import { usePdfZoom } from './usePdfZoom';
import { useSettledWidth } from './useSettledWidth';
import { useVisiblePages } from './useVisiblePages';

// -- Store Imports --
import { useActivePdfInstance } from '@/lib/pdf/ActivePdfStoreContext';

// -- Utils Imports --
import { groupAnnotationsByPage } from '@/lib/pdf/annotationGeometry';
import { annotationAtPoint } from '@/lib/pdf/annotationHitTest';
import { PdfMarkupContext, type PdfMarkupContextValue } from '@/lib/pdf/PdfMarkupContext';

// -- Type Imports --
import type { PdfStore } from '@/lib/stores/pdfStore';
import { HIGHLIGHT_ALPHA } from '@/lib/stores/pdfStore';
import type { PdfAnnotation, PdfComment, PdfHighlight, PdfInk, PdfRect } from '@/lib/types/pdfAnnotation';
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

/** The eraser's grab floor in box px; per-ink reach grows past it with the stroke width. */
const ERASER_HIT_FLOOR = 8;

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
   const commentColor = useStore(store, (state) => state.commentColor);
   const canUndo = useStore(store, (state) => state.undoStack.length > 0);
   const canRedo = useStore(store, (state) => state.redoStack.length > 0);
   const { setPage, setMarkupMode, setTool, setPenColor, setPenWidth, setHighlightColor, setCommentColor } = store.getState().actions;

   // The comment whose editor popover is open; ephemeral UI, reset on remount (a tab switch). Local, not in the store.
   const [openCommentId, setOpenCommentId] = useState<string | null>(null);

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
         const px = ((clientX - rect.left) / rect.width) * boxW;
         const py = ((clientY - rect.top) / rect.height) * boxH;
         const onPage = Object.values(marks).filter((mark) => mark.page === pageNumber);
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

   // Mints an empty comment from a finished rect drag and opens its editor so the body can be authored at once.
   // The history checkpoint stays OPEN until the editor closes: a bodied comment commits one undo step, an
   // abandoned empty one cancels it (see closeComment), so a stray marquee never leaves a phantom step.
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
         setOpenCommentId(id);
      },
      [store],
   );

   // The topmost comment under a client point on one page, or null. Mirrors eraseAt's zoom-independent conversion,
   // but filters to comments so a click reopens only a note (never an ink/highlight underneath).
   const commentAtPoint = useCallback(
      (pageNumber: number, rect: DOMRect, boxW: number, boxH: number, clientX: number, clientY: number) => {
         const marks = store.getState().doc?.annotations;
         if (!marks) return null;
         const px = ((clientX - rect.left) / rect.width) * boxW;
         const py = ((clientY - rect.top) / rect.height) * boxH;
         const comments = Object.values(marks).filter((mark) => mark.page === pageNumber && mark.kind === 'comment');
         const hits = annotationAtPoint(comments, px, py, boxW, boxH, 0);
         return hits[0] ?? null;
      },
      [store],
   );

   const openComment = useCallback((id: string) => setOpenCommentId(id), []);

   // Close path: an empty (never-authored or cleared) comment self-deletes, so a stray marquee leaves no ghost note.
   // A freshly created comment holds an open history checkpoint (commitComment) - authored, it commits to one undo
   // step; abandoned empty, it cancels so add-then-remove leaves no trace. A reopened comment has no open
   // checkpoint, so commit/cancel are no-ops.
   const closeComment = useCallback(
      (id: string) => {
         const actions = store.getState().actions;
         const comment = store.getState().doc?.annotations?.[id];
         if (comment && comment.kind === 'comment' && comment.body.trim() === '') {
            actions.removeAnnotation(id);
            actions.cancelHistory();
         } else {
            actions.commitHistory();
         }
         setOpenCommentId((current) => (current === id ? null : current));
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
         setOpenCommentId((current) => (current === id ? null : current));
      },
      [store],
   );

   const markup = useMemo<PdfMarkupContextValue>(
      () => ({
         mode: markupMode,
         tool,
         penColor,
         penWidth,
         highlightColor,
         commentColor,
         openCommentId,
         commitInk,
         commitHighlight,
         commitComment,
         eraseAt,
         commentAtPoint,
         openComment,
         closeComment,
         setCommentBody,
         deleteComment,
         beginHistory,
         commitHistory,
      }),
      [markupMode, tool, penColor, penWidth, highlightColor, commentColor, openCommentId, commitInk, commitHighlight, commitComment, eraseAt, commentAtPoint, openComment, closeComment, setCommentBody, deleteComment, beginHistory, commitHistory],
   );

   // Grouped per page, referentially stable while `annotations` holds - so a wheel-zoom (which leaves annotations
   // untouched) keeps every page's slice ref, and the page memos survive. Only the changed page's slice re-refs
   // when a mark is added or removed.
   const byPage = useMemo(() => groupAnnotationsByPage(annotations), [annotations]);

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

   // Reader-scoped zoom keys: +/= in, - out, 0 reset. The listener lives only while this surface is mounted
   // (it mounts only when a pdf tab is active), and ignores keys typed into the page input.
   useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
         if (event.ctrlKey || event.metaKey || event.altKey) return;
         const target = event.target as HTMLElement | null;
         if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
         if (event.key === '+' || event.key === '=') zoomIn();
         else if (event.key === '-') zoomOut();
         else if (event.key === '0') resetZoom();
         else return;
         event.preventDefault();
      };
      document.addEventListener('keydown', onKeyDown);
      return () => document.removeEventListener('keydown', onKeyDown);
   }, [zoomIn, zoomOut, resetZoom]);

   return (
      <PdfMarkupContext.Provider value={markup}>
         <div className="absolute inset-0 bg-muted/40">
            <div ref={scrollRef} className="h-full overflow-auto overscroll-contain px-4 py-6">
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
                           registerPage={registerPage}
                        />
                     ))}
               </div>
            </div>
            {markupMode === 'markup' ? (
               <PdfMarkupToolbar
                  tool={tool}
                  onToolChange={setTool}
                  penColor={penColor}
                  onPenColorChange={setPenColor}
                  penWidth={penWidth}
                  onPenWidthChange={setPenWidth}
                  highlightColor={highlightColor}
                  onHighlightColorChange={setHighlightColor}
                  commentColor={commentColor}
                  onCommentColorChange={setCommentColor}
                  canUndo={canUndo}
                  canRedo={canRedo}
                  onUndo={store.getState().actions.undo}
                  onRedo={store.getState().actions.redo}
               />
            ) : null}
            <PdfToolbar
               current={currentPage}
               total={pageCount}
               zoom={zoom}
               markupMode={markupMode}
               onToggleMarkup={() => setMarkupMode(markupMode === 'read' ? 'markup' : 'read')}
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
