// -- Library Imports --
import cuid from 'cuid';

// -- Local Imports --
import { drawerDatabase as db } from '@/lib/drawer/drawerDatabase';
import { PDF_SCHEMA_VERSION, recordToPdfDocument } from './pdfRecords';

// -- Type Imports --
import type { PdfRecord } from './pdfRecords';
import type { PdfDocument } from '@/lib/types/pdf';

/*
 * Framework-agnostic data-access layer for working PDFs. Pure persistence: no React, no
 * zustand, no toasts, no console. A PDF is read-only, so the whole aggregate lives in one
 * `pdfDocs` row and `title` is the only field that ever changes. Mirrors the note
 * repository's create / load / save / link / import / clear surface, minus the note's edit
 * buffer. Nothing outside this module touches `db.pdfDocs`.
 */

/** Creates a new pdf row from a freshly imported asset and returns the stored record. */
export async function createPdf(input: { title: string; assetHash: string; pageCount: number; coverAssetHash?: string | null }): Promise<PdfRecord> {
   const record: PdfRecord = {
      id: cuid(),
      title: input.title,
      assetHash: input.assetHash,
      coverAssetHash: input.coverAssetHash ?? null,
      pageCount: input.pageCount,
      updatedAt: Date.now(),
      drawerItemId: null,
      schemaVersion: PDF_SCHEMA_VERSION,
   };
   await db.pdfDocs.add(record);
   return record;
}

/** Loads a pdf record by id, or `undefined` if it does not exist. */
export function getPdf(id: string): Promise<PdfRecord | undefined> {
   return db.pdfDocs.get(id);
}

/** Loads a pdf and assembles its {@link PdfDocument} aggregate, or `undefined` when absent. */
export async function loadPdf(id: string): Promise<PdfDocument | undefined> {
   const record = await db.pdfDocs.get(id);
   return record ? recordToPdfDocument(record) : undefined;
}

/**
 * Patches a working pdf's title and/or annotations, refreshing `updatedAt`. A no-op when the
 * row is absent (idempotent), so a save that races a close never throws.
 */
export async function patchPdf(id: string, patch: Partial<Pick<PdfRecord, 'title' | 'annotations'>>): Promise<void> {
   await db.pdfDocs.update(id, { ...patch, updatedAt: Date.now() });
}

/** Outcome of {@link savePdfToLinkedDrawerItem} (mirrors the note/board results). */
export interface SavePdfToDrawerResult {
   /** `true` when the linked drawer item still existed and was updated; `false` when the link is dangling or unset. */
   linkedItemUpdated: boolean;
}

/**
 * Autosave: in ONE transaction, flush the working pdf's title + annotations onto its row, then -
 * when it is linked to a drawer `PDF` item that still exists - replace that item's content with the
 * freshly assembled aggregate. An open PDF is always drawer-backed, so this keeps both copies in
 * lockstep with no dirty flag. A missing row returns `false` WITHOUT resurrecting it (a close may
 * have reaped the row); a dangling link returns `false` but the row still saves.
 */
export function savePdfToLinkedDrawerItem(doc: PdfDocument, drawerItemId: string | null): Promise<SavePdfToDrawerResult> {
   return db.transaction('rw', [db.pdfDocs, db.items], async () => {
      const record = await db.pdfDocs.get(doc.id);
      if (!record) return { linkedItemUpdated: false };
      const merged: PdfRecord = { ...record, title: doc.title, annotations: doc.annotations, updatedAt: Date.now() };
      await db.pdfDocs.put(merged);

      if (drawerItemId) {
         const existingItem = await db.items.get(drawerItemId);
         if (existingItem) {
            await db.items.update(drawerItemId, { content: recordToPdfDocument(merged), name: merged.title });
            return { linkedItemUpdated: true };
         }
      }
      return { linkedItemUpdated: false };
   });
}

/**
 * Persists ONLY the reading position, out of band from the annotation autosave: in ONE transaction,
 * write `lastPage` onto the working row and - when linked - onto the drawer copy's content. View
 * state, so it leaves `updatedAt` alone (mirrors {@link savePdfToLinkedDrawerItem}, which never bumps
 * the drawer item's timestamp either). A missing row is a no-op (a close may have reaped it).
 */
export function savePdfLastPage(id: string, page: number, drawerItemId: string | null): Promise<void> {
   return db.transaction('rw', [db.pdfDocs, db.items], async () => {
      const record = await db.pdfDocs.get(id);
      if (!record) return;
      await db.pdfDocs.update(id, { lastPage: page });

      if (drawerItemId) {
         const existingItem = await db.items.get(drawerItemId);
         if (existingItem) {
            const content = existingItem.content as PdfDocument;
            await db.items.update(drawerItemId, { content: { ...content, lastPage: page } });
         }
      }
   });
}

/**
 * Persists a lazily-derived page-1 cover, out of band from the annotation autosave: in ONE transaction,
 * write `coverAssetHash` onto the working row (when open) AND, when linked, onto the drawer copy's content.
 * The cover is derived immutable art, so it leaves `updatedAt` alone (mirrors {@link savePdfLastPage}).
 * Both writes are keyed independently - a drawer preview backfills without the pdf being open, and an open
 * reader keeps lockstep so its next autosave can't clobber the cover. Missing rows are no-ops.
 */
export function patchPdfCover(pdfId: string, drawerItemId: string | null, coverAssetHash: string): Promise<void> {
   return db.transaction('rw', [db.pdfDocs, db.items], async () => {
      await db.pdfDocs.update(pdfId, { coverAssetHash });

      if (drawerItemId) {
         const existingItem = await db.items.get(drawerItemId);
         if (existingItem) {
            const content = existingItem.content as PdfDocument;
            await db.items.update(drawerItemId, { content: { ...content, coverAssetHash } });
         }
      }
   });
}

/**
 * Repairs a placeholder pdf: in ONE transaction, fills the missing bytes-pointer + page count on the
 * working row AND, when linked, on the drawer copy's content, flipping both out of placeholder in
 * lockstep. The supplied file is authoritative, so its `pageCount` wins over the stub's remembered
 * count. Everything identifying stays put - id, title, annotations, `lastPage` are untouched - so
 * inbound `cotm://pdf/<id>` links and the drawer name keep resolving. The drawer link is read off the
 * working row (the repair always runs from an open reader, which materialized the row on open); a
 * missing row is a no-op.
 */
export function repairPdf(id: string, assetHash: string, pageCount: number): Promise<void> {
   return db.transaction('rw', [db.pdfDocs, db.items], async () => {
      const record = await db.pdfDocs.get(id);
      if (!record) return;
      await db.pdfDocs.update(id, { assetHash, pageCount, updatedAt: Date.now() });

      const drawerItemId = record.drawerItemId ?? null;
      if (drawerItemId) {
         const existingItem = await db.items.get(drawerItemId);
         if (existingItem) {
            const content = existingItem.content as PdfDocument;
            await db.items.update(drawerItemId, { content: { ...content, assetHash, pageCount } });
         }
      }
   });
}

/** Deletes a pdf. Idempotent: deleting an absent id is a no-op. */
export async function deletePdf(id: string): Promise<void> {
   await db.pdfDocs.delete(id);
}

/**
 * Materializes a PDF aggregate into the working table - the inverse of {@link loadPdf}.
 * Used when opening a PDF from its drawer copy: the drawer aggregate is the source of truth
 * on open, so any existing row for this pdf id is replaced. Keeps the same id so a reopen
 * focuses-or-restores the same pdf losslessly. `drawerItemId` links the working copy back to
 * the saved item it opened from, or is null for an unlinked import.
 */
export async function importPdf(doc: PdfDocument, drawerItemId: string | null): Promise<void> {
   const record: PdfRecord = {
      id: doc.id,
      title: doc.title,
      assetHash: doc.assetHash,
      coverAssetHash: doc.coverAssetHash ?? null,
      pageCount: doc.pageCount,
      annotations: doc.annotations,
      lastPage: doc.lastPage,
      updatedAt: Date.now(),
      drawerItemId: drawerItemId || null,
      schemaVersion: PDF_SCHEMA_VERSION,
   };
   await db.pdfDocs.put(record);
}

/**
 * Lists EVERY working pdf aggregate, for the asset GC's reference scan (an unsaved open
 * pdf's blob would be reclaimed if the sweep never saw its `assetHash`). Reads the whole
 * `pdfDocs` table; the sweep runs rarely, so the full read is fine.
 */
export async function listAllPdfs(): Promise<PdfDocument[]> {
   const records = await db.pdfDocs.toArray();
   return records.map(recordToPdfDocument);
}

/** Deletes every pdf row (powers "Reset app"), mirroring `clearAllNotes`. */
export async function clearAllPdfs(): Promise<void> {
   await db.pdfDocs.clear();
}
