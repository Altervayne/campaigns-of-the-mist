// -- Type Imports --
import type { PdfDocument } from '@/lib/types/pdf';

/**
 * The per-record schema version for pdf rows, written to `PdfRecord.schemaVersion`.
 * Tracks the Dexie `pdfDocs` store; bump it (with a Dexie version upgrade) when the record
 * shape itself changes.
 */
export const PDF_SCHEMA_VERSION = 1;

/**
 * One row per open/working PDF in the `pdfDocs` store. A PDF is read-only, so the whole
 * aggregate is stored inline and `title` is the only field that ever changes. `updatedAt`
 * powers last-write-wins; `drawerItemId` links the working row to its saved drawer copy,
 * mirroring `NoteRecord.drawerItemId`.
 */
export interface PdfRecord {
   /** Primary key (a stable cuid assigned at creation, shared with the aggregate `id`). */
   id: string;
   /** Tab / drawer / preview name (the only mutable field). */
   title: string;
   /** Pointer into `pdfAssets` (the dedup key). */
   assetHash: string;
   /** Page count, parsed once at import. */
   pageCount: number;
   /** Epoch milliseconds of the last write; drives last-write-wins. */
   updatedAt: number;
   /** The drawer item this PDF is linked to, or null when unsaved (mirrors `NoteRecord.drawerItemId`). */
   drawerItemId?: string | null;
   /** Per-record schema marker for future record-shape migrations. */
   schemaVersion: number;
}

/** Projects a stored record onto the {@link PdfDocument} aggregate (drops persistence-only fields). */
export function recordToPdfDocument(record: PdfRecord): PdfDocument {
   return { id: record.id, title: record.title, assetHash: record.assetHash, pageCount: record.pageCount };
}
