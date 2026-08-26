// -- Local Imports --
import { listAllItemContents } from '@/lib/drawer/drawerRepository';
import { listAllPdfs } from './pdfRepository';

// -- Type Imports --
import type { DrawerItemContent } from '@/lib/types/drawer';
import type { PdfDocument } from '@/lib/types/pdf';

/*
 * The "mark" side of PDF garbage collection: a parallel of the image
 * `collectReferencedAssetHashes`, against `pdfAssets` only. A PDF asset hash is referenced
 * from exactly two roots - a saved `PDF` drawer item's `content.assetHash` and a WORKING
 * `pdfDocs` row's `assetHash` - and nowhere else. A portal targets a PDF by id and does not
 * own the blob (same rule as note references), so boards/portals are never walked here.
 */

/**
 * Whether a drawer item's content is a {@link PdfDocument}. A PDF carries `assetHash` +
 * `pageCount` and none of the other content kinds' discriminants (a character's `cards`, a
 * board's `items`, a note's `body`, a card's `details`), so the shape alone identifies it.
 */
function isPdfContent(content: DrawerItemContent): content is PdfDocument {
   return (
      typeof (content as PdfDocument).assetHash === 'string' &&
      typeof (content as PdfDocument).pageCount === 'number' &&
      !('cards' in content) &&
      !('body' in content) &&
      !('details' in content)
   );
}

/**
 * Collects every PDF asset hash currently referenced in stored data: every saved `PDF` drawer
 * item's `assetHash` and every working `pdfDocs` row's `assetHash` (an unsaved open PDF's blob
 * would be reclaimed if the sweep never saw its hash).
 *
 * @returns The set of referenced hashes. Anything in `pdfAssets` NOT in this set is an orphan
 *   candidate for the sweep (subject to the grace window).
 */
export async function collectReferencedPdfHashes(): Promise<Set<string>> {
   const referenced = new Set<string>();

   const [itemContents, workingPdfs] = await Promise.all([listAllItemContents(), listAllPdfs()]);

   for (const content of itemContents) {
      // A placeholder PDF item (null hash) is not `isPdfContent` and references no blob; the truthy check keeps
      // the string set free of null and satisfies the type.
      if (isPdfContent(content) && content.assetHash) referenced.add(content.assetHash);
   }
   // A placeholder row (null hash) references no blob, so it never joins the string set.
   for (const pdf of workingPdfs) if (pdf.assetHash) referenced.add(pdf.assetHash);

   return referenced;
}
