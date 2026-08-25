// -- Local Imports --
import { collectReferencedPdfHashes } from './collectReferencedPdfHashes';
import {
   deletePdfAssets,
   getPdfAssetByteSizes,
   listPdfAssetHashes,
   readLastPdfSweep,
   writeLastPdfSweep,
} from './pdfAssetRepository';
import {
   estimateStorageUsage,
   GRACE_WINDOW_MS,
   STORAGE_SOFT_CAP_BYTES,
   type SweepResult,
} from '@/lib/assets/assetGarbageCollector';

/*
 * Mark-and-sweep garbage collection for stored PDF assets: a parallel of the image
 * `assetGarbageCollector`, against `db.pdfAssets` only. The grace window and the soft cap are
 * shared with the image collector (the cap reads the whole-origin storage estimate, so it is
 * global), while the count/grace bookkeeping is kept per-store under its own meta key. Timer-free
 * so it is directly unit-testable; scheduling lives in the triggers, alongside the image sweep.
 */

/**
 * Runs one PDF sweep: deletes PDF assets that are unreferenced AND older than the grace window,
 * records the bookkeeping the periodic gate reads, and returns the count and bytes reclaimed.
 * The grace window is the safety guard - a just-imported PDF whose drawer item / working row has
 * not yet been written is young and protected, so no collect-then-delete transactionality is needed.
 *
 * @param reason - Which trigger invoked the sweep (recorded for debugging).
 */
export async function runPdfSweep(reason: 'startup' | 'manual' | 'periodic'): Promise<SweepResult> {
   const referenced = await collectReferencedPdfHashes();
   const existing = await listPdfAssetHashes();
   const now = Date.now();

   const candidates = existing
      .filter((asset) => !referenced.has(asset.hash) && now - asset.createdAt >= GRACE_WINDOW_MS)
      .map((asset) => asset.hash);

   const reclaimedBytes = await getPdfAssetByteSizes(candidates);
   await deletePdfAssets(candidates);
   await writeLastPdfSweep({ at: now, assetCount: existing.length - candidates.length, reason });

   return { deleted: candidates.length, reclaimedBytes };
}

/**
 * Whether a periodic tick should actually sweep PDFs. True when the PDF asset count grew since
 * the last PDF sweep (new imports) or storage is over the soft cap; otherwise the tick is a
 * no-op. Same precision boundary as the image gate: an orphan created purely by removing a
 * reference does not grow the count, so the forced startup and manual sweeps reclaim those.
 */
export async function isPeriodicPdfSweepWarranted(): Promise<boolean> {
   const [existing, lastSweep] = await Promise.all([listPdfAssetHashes(), readLastPdfSweep()]);
   if (existing.length > (lastSweep?.assetCount ?? 0)) return true;

   const usage = await estimateStorageUsage();
   return usage !== null && usage > STORAGE_SOFT_CAP_BYTES;
}
