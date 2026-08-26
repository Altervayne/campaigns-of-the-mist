// -- Type Imports --
import type { PdfDocument } from '@/lib/types/pdf';

/*
 * Shared placeholder predicate for PDFs. A placeholder is a byteless record - its `assetHash` is
 * null, so the pages and annotations are kept but the file itself is not here yet (awaiting repair).
 * The null hash is the whole discriminant; there is no separate flag.
 */

/** Whether a PDF is a byteless placeholder (no `assetHash` yet), so it reads as "needs file". */
export function isPlaceholderPdf(doc: Pick<PdfDocument, 'assetHash'> | undefined | null): boolean {
   return !!doc && !doc.assetHash;
}

/** The real files a placeholder can adopt: every saved PDF with bytes, minus the placeholder itself. */
export function selectableRepairSources<T extends Pick<PdfDocument, 'id' | 'assetHash'>>(pdfs: T[], selfPdfId: string): T[] {
   return pdfs.filter((pdf) => !isPlaceholderPdf(pdf) && pdf.id !== selfPdfId);
}
