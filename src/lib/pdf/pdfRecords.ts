// -- Type Imports --
import type { PdfDocument } from '@/lib/types/pdf';
import type { PdfAnnotation } from '@/lib/types/pdfAnnotation';

/**
 * The per-record schema version for pdf rows, written to `PdfRecord.schemaVersion`.
 * Tracks the Dexie `pdfDocs` store; bump it (with a Dexie version upgrade) when the record
 * shape itself changes.
 */
export const PDF_SCHEMA_VERSION = 1;

/**
 * One row per open/working PDF in the `pdfDocs` store. The whole aggregate is stored inline;
 * `title` and `annotations` are the mutable fields. `updatedAt` powers last-write-wins;
 * `drawerItemId` links the working row to its saved drawer copy, mirroring `NoteRecord.drawerItemId`.
 */
export interface PdfRecord {
   /** Primary key (a stable cuid assigned at creation, shared with the aggregate `id`). */
   id: string;
   /** Tab / drawer / preview name. */
   title: string;
   /** Pointer into `pdfAssets` (the dedup key). `null` ⇔ no bytes yet (placeholder awaiting a file). */
   assetHash: string | null;
   /** Page count, parsed once at import. */
   pageCount: number;
   /** Markup annotations keyed by annotation id. Optional, non-indexed: old rows read as `undefined`. */
   annotations?: Record<string, PdfAnnotation>;
   /** Last-read page, 1-based. Optional, non-indexed view state; absent rows read as `undefined` (`?? 1`). */
   lastPage?: number;
   /** Epoch milliseconds of the last write; drives last-write-wins. */
   updatedAt: number;
   /** The drawer item this PDF is linked to, or null when unsaved (mirrors `NoteRecord.drawerItemId`). */
   drawerItemId?: string | null;
   /** Per-record schema marker for future record-shape migrations. */
   schemaVersion: number;
}

/** Projects a stored record onto the {@link PdfDocument} aggregate (drops persistence-only fields). */
export function recordToPdfDocument(record: PdfRecord): PdfDocument {
   return {
      id: record.id,
      title: record.title,
      assetHash: record.assetHash,
      pageCount: record.pageCount,
      annotations: record.annotations,
      lastPage: record.lastPage,
   };
}
