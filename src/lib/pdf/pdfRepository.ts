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
export async function createPdf(input: { title: string; assetHash: string; pageCount: number }): Promise<PdfRecord> {
   const record: PdfRecord = {
      id: cuid(),
      title: input.title,
      assetHash: input.assetHash,
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
 * Patches a working pdf's title, refreshing `updatedAt`. A no-op when the row is absent
 * (idempotent), so a rename that races a close never throws. Title is the only mutable field.
 */
export async function patchPdf(id: string, patch: Partial<Pick<PdfRecord, 'title'>>): Promise<void> {
   await db.pdfDocs.update(id, { ...patch, updatedAt: Date.now() });
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
      pageCount: doc.pageCount,
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
