/**
 * One row per stored PDF asset in the `pdfAssets` store (Dexie `version(8)`).
 *
 * Like image assets, PDFs are CONTENT-ADDRESSED: the primary key `hash` is the SHA-256
 * of the raw PDF bytes, so importing the same file twice collapses to one row and a store
 * is a dedup-aware no-op when the hash already exists. The `blob` is stored natively
 * (structured-clone), matching the drawer's content-as-blob granularity.
 *
 * There is deliberately NO per-record schema version (unlike `PdfRecord`): a row is an
 * immutable content-addressed blob plus its size, so its shape cannot meaningfully
 * migrate - different bytes produce a different hash and a different row.
 */
export interface PdfAssetRecord {
   /** Primary key: SHA-256 of the RAW pdf bytes, as a hex string. */
   hash: string;
   /** The raw `application/pdf` bytes, stored natively. */
   blob: Blob;
   /** Always `'application/pdf'`. */
   mimeType: string;
   /** `blob.size`, denormalized for cheap footprint math without loading the blob. */
   byteSize: number;
   /** Epoch milliseconds the row was first stored; powers the GC grace window. */
   createdAt: number;
}
