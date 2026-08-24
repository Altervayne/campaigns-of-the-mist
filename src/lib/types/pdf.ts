/**
 * A PDF document's drawer content: flat, id-keyed, no persistence-only fields. A PDF is
 * read-only, so the only mutable field is `title`; the bytes live in the `pdfAssets` store
 * addressed by `assetHash`, and identical files collapse to one asset.
 */
export interface PdfDocument {
   id: string;
   /** Tab / drawer / preview name. */
   title: string;
   /** Pointer into the `pdfAssets` store (SHA-256 of the raw PDF bytes). */
   assetHash: string;
   /** Page count, parsed once at import. */
   pageCount: number;
}
