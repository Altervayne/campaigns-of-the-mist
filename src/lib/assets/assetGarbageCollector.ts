// -- Local Imports --
import { collectReferencedAssetHashes } from './collectReferencedAssetHashes';
import {
   deleteAssets,
   getAssetByteSizes,
   listAssetHashes,
   readLastSweep,
   writeLastSweep,
} from './assetRepository';

/*
 * Mark-and-sweep garbage collection for stored image assets. The single entry point
 * `runSweep` collects every referenced hash, then deletes the unreferenced ones that
 * are past the grace window. All triggers (startup, manual, periodic) funnel through
 * it; the periodic trigger first checks `isPeriodicSweepWarranted` so it only sweeps
 * under real pressure. This module is timer-free so it is directly unit-testable;
 * scheduling lives in the triggers (AppStartManager + useAssetGarbageCollection).
 *
 * Reads go through repositories; assets are written only via `assetRepository`.
 */

/** Assets younger than this are never deleted, even when unreferenced. Shared with the PDF collector. */
export const GRACE_WINDOW_MS = 5 * 60 * 1000;
/** Coarse cadence at which the periodic trigger checks whether a sweep is warranted. */
export const PERIODIC_INTERVAL_MS = 10 * 60 * 1000;
/**
 * A storage estimate above this forces a periodic sweep even without count growth. Whole-origin
 * (the estimate is global), so the PDF collector and the import size-warning read the same cap.
 */
export const STORAGE_SOFT_CAP_BYTES = 250 * 1024 * 1024;

/** What a sweep reclaimed. */
export interface SweepResult {
   /** Number of asset rows deleted. */
   deleted: number;
   /** Total bytes freed (summed `byteSize` of the deleted rows). */
   reclaimedBytes: number;
}

/**
 * Reads `navigator.storage.estimate().usage`, or `null` when the API is unavailable
 * or throws. Also backs the Settings usage readout.
 */
export async function estimateStorageUsage(): Promise<number | null> {
   if (!navigator.storage?.estimate) return null;
   try {
      const { usage } = await navigator.storage.estimate();
      return usage ?? null;
   } catch {
      return null;
   }
}

/**
 * Runs one sweep: deletes assets that are unreferenced AND older than the grace
 * window, records the bookkeeping the periodic gate reads, and returns the count and
 * bytes reclaimed.
 *
 * The grace window is the core safety guard: it protects a just-uploaded asset whose
 * referencing card has not yet been flushed to its working record, and it removes the
 * need for strict collect-then-delete transactionality - any reference added
 * mid-sweep points at a young, protected asset.
 *
 * @param reason - Which trigger invoked the sweep (recorded for debugging).
 */
export async function runSweep(reason: 'startup' | 'manual' | 'periodic'): Promise<SweepResult> {
   const referenced = await collectReferencedAssetHashes();
   const existing = await listAssetHashes();
   const now = Date.now();

   const candidates = existing
      .filter((asset) => !referenced.has(asset.hash) && now - asset.createdAt >= GRACE_WINDOW_MS)
      .map((asset) => asset.hash);

   const reclaimedBytes = await getAssetByteSizes(candidates);
   await deleteAssets(candidates);
   await writeLastSweep({ at: now, assetCount: existing.length - candidates.length, reason });

   return { deleted: candidates.length, reclaimedBytes };
}

/**
 * Whether a periodic tick should actually sweep. True when the asset count grew since
 * the last sweep (new uploads/replacements) or storage is over the soft cap; otherwise
 * the tick is a no-op, since with no churn there is nothing to reclaim.
 *
 * Precision boundary: an orphan created purely by REMOVING a reference without storing
 * any new asset (e.g. clearing a portrait to null) does not grow the count, so the
 * periodic tick may skip it. The forced startup and manual sweeps reclaim those.
 */
export async function isPeriodicSweepWarranted(): Promise<boolean> {
   const [existing, lastSweep] = await Promise.all([listAssetHashes(), readLastSweep()]);
   if (existing.length > (lastSweep?.assetCount ?? 0)) return true;

   const usage = await estimateStorageUsage();
   return usage !== null && usage > STORAGE_SOFT_CAP_BYTES;
}
