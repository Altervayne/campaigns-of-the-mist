// -- React Imports --
import { useEffect, useState } from 'react';

// -- Local Imports --
import { resolveOutline, type PdfOutlineEntry } from '@/lib/pdf/pdfOutline';

// -- Type Imports --
import type { PDFDocumentProxy } from 'pdfjs-dist';

/**
 * Resolves the open PDF's outline once per document. The proxy is stable per document (the reader remounts
 * per `doc.id`), so this fires once on open; a `cancelled` guard keeps an unmount or proxy swap from setting
 * state late. Starts `loading`, ends with the resolved tree (empty when the PDF carries no outline).
 */
export function usePdfOutline(proxy: PDFDocumentProxy): { outline: PdfOutlineEntry[]; loading: boolean } {
   const [outline, setOutline] = useState<PdfOutlineEntry[]>([]);
   const [loading, setLoading] = useState(true);

   useEffect(() => {
      let cancelled = false;
      setLoading(true);
      void (async () => {
         try {
            const resolved = await resolveOutline(proxy);
            if (!cancelled) setOutline(resolved);
         } catch {
            // A parse failure leaves no outline; the panel shows its empty state.
            if (!cancelled) setOutline([]);
         } finally {
            if (!cancelled) setLoading(false);
         }
      })();
      return () => {
         cancelled = true;
      };
   }, [proxy]);

   return { outline, loading };
}
