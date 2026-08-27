// -- React Imports --
import { useEffect, useState } from 'react';

// -- Local Imports --
import { backfillPdfCover } from '@/lib/pdf/pdfCover';
import { patchPdfCover } from '@/lib/pdf/pdfRepository';

// -- Type Imports --
import type { PdfDocument } from '@/lib/types/pdf';

/*
 * Lazy PDF-cover backfill for the drawer preview. A pdf imported before covers existed reads
 * `coverAssetHash === null` but still has bytes; on its first preview this renders page 1 once, stores the
 * cover, and persists the hash onto both the working row and the saved drawer item. A placeholder (no bytes)
 * is not backfillable and keeps the glyph. Best-effort: a failed render leaves the glyph and never retries.
 */

// pdf ids whose backfill has been kicked this session; keyed so repeated preview mounts (scroll in/out,
// drag clones) never re-render or retry-storm the same pdf.
const kicked = new Set<string>();

/**
 * Returns the cover hash to display for `pdf`: its existing cover, or one derived once on first view. Kicks
 * the render only when the pdf has bytes but no cover. `drawerItemId` is the saved item the persisted hash
 * lands on (a no-op when it does not resolve, e.g. a transient drag clone).
 */
export function usePdfCoverBackfill(pdf: PdfDocument, drawerItemId: string | null): string | null {
   const existing = pdf.coverAssetHash ?? null;
   const [backfilled, setBackfilled] = useState<string | null>(null);

   useEffect(() => {
      if (existing || !pdf.assetHash) return; // already covered, or a placeholder with no bytes to render
      if (kicked.has(pdf.id)) return;
      kicked.add(pdf.id);

      let cancelled = false;
      void (async () => {
         const hash = await backfillPdfCover(pdf.assetHash!);
         if (!hash) return; // a failed render keeps the glyph; the id stays kicked, so no retry storm
         await patchPdfCover(pdf.id, drawerItemId, hash);
         if (!cancelled) setBackfilled(hash);
      })();

      return () => {
         cancelled = true;
      };
   }, [existing, pdf.id, pdf.assetHash, drawerItemId]);

   return existing ?? backfilled;
}
