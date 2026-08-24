// -- React Imports --
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { useStore } from 'zustand';

// -- Icon Imports --
import { FileWarning } from 'lucide-react';

// -- Component Imports --
import { MistSpinner } from '@/components/molecules/MistSpinner';
import { PdfPageCanvas } from './PdfPageCanvas';
import { PdfToolbar } from './PdfToolbar';

// -- Local Imports --
import { usePdfContainerWidth } from './usePdfContainerWidth';
import { usePdfDefaultAspect } from './usePdfDefaultAspect';
import { usePdfZoom } from './usePdfZoom';
import { useSettledWidth } from './useSettledWidth';
import { useVisiblePages } from './useVisiblePages';

// -- Store Imports --
import { useActivePdfInstance } from '@/lib/pdf/ActivePdfStoreContext';

// -- Type Imports --
import type { PdfStore } from '@/lib/stores/pdfStore';
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
   const { setPage } = store.getState().actions;

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

   // Land the reading position once the pages have a height, then keep it as the layout changes. First pass
   // (mount): scroll to the restored page. Later passes hold the viewport-center content in place - no snap -
   // on BOTH the live zoom (`effectivePageWidth`) AND the settle re-layout (`renderWidth`, where the scaled
   // gaps snap to real ones), so the settle never nudges the page. A layout effect (before paint) keeps it
   // flicker-free.
   const restored = useRef(false);
   useLayoutEffect(() => {
      if (effectivePageWidth <= 0 || renderWidth <= 0) return;
      const scroller = scrollRef.current;
      if (!scroller) return;
      if (!restored.current) {
         restored.current = true;
         if (restoreToPage > 1) scrollToPage(restoreToPage);
         return;
      }
      const { y, x } = viewportCenter.current;
      scroller.scrollTop = Math.max(0, y * scroller.scrollHeight - scroller.clientHeight / 2);
      scroller.scrollLeft = Math.max(0, x * scroller.scrollWidth - scroller.clientWidth / 2);
   }, [effectivePageWidth, renderWidth, restoreToPage, scrollToPage]);

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
                        registerPage={registerPage}
                     />
                  ))}
            </div>
         </div>
         <PdfToolbar
            current={currentPage}
            total={pageCount}
            zoom={zoom}
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
