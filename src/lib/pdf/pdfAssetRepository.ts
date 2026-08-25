// -- Library Imports --
import { type Table } from 'dexie';

// -- Local Imports --
import { drawerDatabase as db } from '@/lib/drawer/drawerDatabase';
import { PdfRepositoryError } from './pdfErrors';

// -- Type Imports --
import type { PdfAssetRecord } from './pdfAssetRecords';

/*
 * Framework-agnostic data-access layer for content-addressed PDF assets. Pure persistence:
 * no React, no zustand, no toasts, no console. Lives in the same Dexie database as the
 * drawer; nothing outside this module touches `db.pdfAssets`. Rows are keyed by `hash`
 * (SHA-256 of the raw pdf bytes), so stores are dedup-aware and identical bytes collapse to
 * one row. Mirrors the image `assetRepository`, minus the image pipeline.
 */

/**
 * Runs `work` in a read/write transaction over `tables`. Any failure aborts the
 * transaction (rolling back every write) and is rethrown as a
 * {@link PdfRepositoryError} preserving the original cause.
 */
async function runWriteTransaction<T>(tables: Table[], work: () => Promise<T>): Promise<T> {
   try {
      return await db.transaction('rw', tables, work);
   } catch (error) {
      throw new PdfRepositoryError(
         `Pdf write transaction failed: ${error instanceof Error ? error.message : 'unknown error'}`,
         { cause: error },
      );
   }
}

/**
 * Stores a PDF's raw bytes, dedup-aware. If a row with the same `hash` already exists,
 * returns the hash WITHOUT rewriting (content-addressed: identical bytes are an identical
 * row, and the original `createdAt` is preserved). Otherwise inserts a fresh
 * {@link PdfAssetRecord} stamped with `createdAt: Date.now()`.
 *
 * @returns The asset's `hash` (its primary key), existing or newly inserted.
 */
export function storePdfAsset(input: { hash: string; blob: Blob; mimeType: string; byteSize: number }): Promise<string> {
   return runWriteTransaction([db.pdfAssets], async () => {
      // Existence check on the primary key only - never loads the (potentially large) blob.
      const alreadyStored = await db.pdfAssets.where('hash').equals(input.hash).count();
      if (alreadyStored > 0) return input.hash;

      const record: PdfAssetRecord = {
         hash: input.hash,
         blob: input.blob,
         mimeType: input.mimeType,
         byteSize: input.byteSize,
         createdAt: Date.now(),
      };
      await db.pdfAssets.add(record);
      return input.hash;
   });
}

/** Returns just the stored blob for `hash`, or `undefined` when no such asset exists. */
export async function getPdfBlob(hash: string): Promise<Blob | undefined> {
   const record = await db.pdfAssets.get(hash);
   return record?.blob;
}

/**
 * Returns the full stored record for `hash` (blob + metadata), or `undefined` when absent.
 * Used by export embedding, which needs the size alongside the bytes.
 */
export function getPdfAsset(hash: string): Promise<PdfAssetRecord | undefined> {
   return db.pdfAssets.get(hash);
}

/**
 * Lists every asset's `hash` + `createdAt`, never the blobs - the GC's cheap "what exists"
 * side. Reads only the `createdAt` index and the primary keys it traverses, so no row body
 * (and no blob) is deserialized.
 */
export async function listPdfAssetHashes(): Promise<{ hash: string; createdAt: number }[]> {
   const ordered = db.pdfAssets.orderBy('createdAt');
   // Both reads traverse the same `createdAt` index in the same order, so element i
   // of each lines up: createdAts[i] belongs to hashes[i].
   const [hashes, createdAts] = await Promise.all([
      ordered.primaryKeys() as Promise<string[]>,
      ordered.keys() as Promise<number[]>,
   ]);
   return hashes.map((hash, index) => ({ hash, createdAt: createdAts[index] }));
}

/**
 * Bulk-deletes assets by hash. Idempotent: hashes with no matching row are no-ops.
 * Used only by the GC sweep.
 */
export function deletePdfAssets(hashes: string[]): Promise<void> {
   return runWriteTransaction([db.pdfAssets], async () => {
      await db.pdfAssets.bulkDelete(hashes);
   });
}

/**
 * Sums the `byteSize` of the given assets, for reporting how much a sweep reclaimed.
 * Reads the candidate rows directly (the sweep calls this only for the small set it is
 * about to delete); absent hashes contribute nothing.
 */
export async function getPdfAssetByteSizes(hashes: string[]): Promise<number> {
   if (hashes.length === 0) return 0;
   const rows = await db.pdfAssets.bulkGet(hashes);
   return rows.reduce((total, row) => total + (row?.byteSize ?? 0), 0);
}

/** Deletes all PDF asset rows (powers "Reset app"), mirroring `clearAllAssets`. */
export function clearAllPdfAssets(): Promise<void> {
   return runWriteTransaction([db.pdfAssets], async () => {
      await db.pdfAssets.clear();
   });
}

/** Bookkeeping written after each PDF sweep; gates the periodic check. Twin of `AssetSweepRecord`. */
export interface PdfAssetSweepRecord {
   /** Epoch ms the sweep ran. */
   at: number;
   /** PDF asset count remaining after the sweep; the periodic gate compares the live count against this. */
   assetCount: number;
   /** What triggered the sweep, for debugging. */
   reason: 'startup' | 'manual' | 'periodic';
}

/** Reads the last PDF sweep bookkeeping from the `meta` store, or `undefined` if never swept. */
export async function readLastPdfSweep(): Promise<PdfAssetSweepRecord | undefined> {
   const row = await db.meta.get('pdfAssetsLastSwept');
   return row?.value as PdfAssetSweepRecord | undefined;
}

/** Records the outcome of a PDF sweep in the `meta` store, for the periodic pressure gate. */
export async function writeLastPdfSweep(record: PdfAssetSweepRecord): Promise<void> {
   await db.meta.put({ key: 'pdfAssetsLastSwept', value: record });
}
