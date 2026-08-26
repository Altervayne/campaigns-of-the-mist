// -- Type Imports --
import type { PdfAnnotation } from '@/lib/types/pdfAnnotation';

/**
 * A PDF document's drawer content: flat, id-keyed, no persistence-only fields. The bytes live
 * in the `pdfAssets` store addressed by `assetHash`, and identical files collapse to one asset.
 * `title` and `annotations` are the mutable fields; annotations autosave to the drawer copy.
 */
export interface PdfDocument {
   id: string;
   /** Tab / drawer / preview name. */
   title: string;
   /** Pointer into the `pdfAssets` store (SHA-256 of the raw PDF bytes). `null` ⇔ no bytes yet (placeholder awaiting a file). */
   assetHash: string | null;
   /** Page count, parsed once at import. */
   pageCount: number;
   /** Markup annotations keyed by annotation id, each carrying its own `page`. Absent until the first is drawn. */
   annotations?: Record<string, PdfAnnotation>;
   /** Last-read page, 1-based; restores the reading position on reopen. Optional, `?? 1` on read. */
   lastPage?: number;
}
