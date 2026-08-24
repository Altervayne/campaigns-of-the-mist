// -- React Imports --
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { useStore } from 'zustand';

// -- Icon Imports --
import { FileType, FileWarning, LoaderCircle } from 'lucide-react';

// -- Component Imports --
import { PdfPageCanvas } from './PdfPageCanvas';
import { PdfPageIndicator } from './PdfPageIndicator';

// -- Local Imports --
import { usePdfContainerWidth } from './usePdfContainerWidth';
import { usePdfDefaultAspect } from './usePdfDefaultAspect';
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

/** Fit-width cap, so a page never blows up past a crisp, readable size on an ultra-wide panel. */
const MAX_PAGE_WIDTH = 1000;

export function PdfView() {
   const store = useActivePdfInstance();
   if (!store) return null;
   return <PdfSurface store={store} />;
}

function PdfSurface({ store }: { store: PdfStore }) {
   const status = useStore(store, (state) => state.status);
   const doc = useStore(store, (state) => state.doc);
   const proxy = useStore(store, (state) => state.proxy);
   const currentPage = useStore(store, (state) => state.currentPage);

   if (status === 'error') return <PdfCenteredState kind="error" />;
   if (status !== 'ready' || !proxy || !doc) return <PdfCenteredState kind="loading" />;

   return (
      <PdfReader
         proxy={proxy}
         pageCount={doc.pageCount}
         currentPage={currentPage}
         onCurrentPage={store.getState().actions.setPage}
         // Remount per document so the page list, observers, and canvases never cross PDFs.
         key={doc.id}
      />
   );
}

interface PdfReaderProps {
   proxy: PDFDocumentProxy;
   pageCount: number;
   currentPage: number;
   onCurrentPage: (page: number) => void;
}

function PdfReader({ proxy, pageCount, currentPage, onCurrentPage }: PdfReaderProps) {
   const scrollRef = useRef<HTMLDivElement>(null);
   const columnRef = useRef<HTMLDivElement>(null);
   // The reading position to restore on (re)mount: the page the instance kept, frozen at mount so live
   // scrolling never moves the target. Seeded into the visible set so its canvas renders from the first
   // frame instead of flashing white until the observer catches up.
   const [restoreToPage] = useState(currentPage);
   const contentWidth = usePdfContainerWidth(columnRef);
   const defaultAspect = usePdfDefaultAspect(proxy);
   const { visible, registerPage } = useVisiblePages(scrollRef, pageCount, onCurrentPage, restoreToPage);

   const pageWidth = Math.min(contentWidth, MAX_PAGE_WIDTH);
   const pages = useMemo(() => Array.from({ length: pageCount }, (_, index) => index + 1), [pageCount]);

   // The surface unmounts on a tab switch and remounts here, so scroll to the restored page once the pages
   // have a measured height. A layout effect (before paint) lands the scroll before the observer's first
   // pass, so the seeded page stays mounted and never flashes. One-shot, so it never fights live scrolling.
   const restored = useRef(false);
   useLayoutEffect(() => {
      if (restored.current || pageWidth <= 0) return;
      restored.current = true;
      const scroller = scrollRef.current;
      const box = scroller?.querySelector<HTMLElement>(`[data-page="${restoreToPage}"]`);
      if (scroller && box && restoreToPage > 1) {
         scroller.scrollTop += box.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      }
   }, [pageWidth, restoreToPage]);

   return (
      <div className="absolute inset-0 bg-muted/40">
         <div ref={scrollRef} className="h-full overflow-y-auto overscroll-contain px-4 py-6">
            <div ref={columnRef} className="mx-auto flex w-full max-w-[1000px] flex-col items-center gap-4">
               {pageWidth > 0 &&
                  pages.map((pageNumber) => (
                     <PdfPageCanvas
                        key={pageNumber}
                        proxy={proxy}
                        pageNumber={pageNumber}
                        width={pageWidth}
                        defaultAspect={defaultAspect}
                        isVisible={visible.has(pageNumber)}
                        registerPage={registerPage}
                     />
                  ))}
            </div>
         </div>
         <PdfPageIndicator current={currentPage} total={pageCount} />
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
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background text-muted-foreground">
         <FileType className="h-10 w-10 opacity-40" />
         <div className="flex items-center gap-2">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            <span className="text-sm">{t('PdfView.loading')}</span>
         </div>
      </div>
   );
}
