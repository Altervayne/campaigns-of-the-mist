// -- React Imports --
import { useEffect, useMemo, useRef } from 'react';

// -- Component Imports --
import { PdfThumbnail } from './PdfThumbnail';

// -- Type Imports --
import type { PDFDocumentProxy } from 'pdfjs-dist';

/*
 * The thumbnails tab: a vertical column of page thumbnails, one per page, each jumping to its page on click.
 * On mount it scrolls the current page's thumb into view once so opening the panel lands you where you are;
 * it does NOT re-scroll as the current page changes while reading, which would fight the user's scroll.
 */

/** Thumbnail render width, in px. */
const THUMB_WIDTH = 200;

interface PdfThumbnailStripProps {
   proxy: PDFDocumentProxy;
   pageCount: number;
   currentPage: number;
   defaultAspect: number;
   onJump: (page: number) => void;
}

export function PdfThumbnailStrip({ proxy, pageCount, currentPage, defaultAspect, onJump }: PdfThumbnailStripProps) {
   const containerRef = useRef<HTMLDivElement>(null);
   // Center the current thumb once when the strip mounts; guarded so a later `currentPage` change doesn't re-scroll.
   const landed = useRef(false);

   useEffect(() => {
      if (landed.current) return;
      landed.current = true;
      const el = containerRef.current?.querySelector<HTMLElement>(`[data-thumb-page="${currentPage}"]`);
      el?.scrollIntoView({ block: 'center' });
   }, [currentPage]);

   const pages = useMemo(() => Array.from({ length: pageCount }, (_, index) => index + 1), [pageCount]);

   return (
      <div ref={containerRef} className="flex h-full flex-col items-center gap-3 overflow-y-auto bg-background px-3 py-3">
         {pages.map((pageNumber) => (
            <PdfThumbnail
               key={pageNumber}
               proxy={proxy}
               pageNumber={pageNumber}
               width={THUMB_WIDTH}
               defaultAspect={defaultAspect}
               isCurrent={pageNumber === currentPage}
               onJump={onJump}
            />
         ))}
      </div>
   );
}
