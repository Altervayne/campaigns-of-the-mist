// -- Library Imports --
import { beforeEach, describe, expect, it } from 'vitest';

// -- Local Imports --
import { drawerDatabase } from '@/lib/drawer/drawerDatabase';
import { isPeriodicPdfSweepWarranted, runPdfSweep } from './pdfGarbageCollector';

// -- Type Imports --
import type { PdfAssetRecord } from './pdfAssetRecords';
import type { PdfAssetSweepRecord } from './pdfAssetRepository';
import type { PdfRecord } from './pdfRecords';
import type { DrawerItemRecord } from '@/lib/drawer/drawerRecords';
import type { PdfDocument } from '@/lib/types/pdf';

/*
 * Unit tests for the parallel PDF mark-and-sweep collector against fake-indexeddb. Synthetic
 * PdfAssetRecords are inserted directly with controlled `createdAt` so the grace window can be
 * exercised deterministically; references are seeded from both roots (a drawer `PDF` item and a
 * working `pdfDocs` row). The GC logic is timer-free, so it is driven here without scheduling.
 */

const GRACE_MS = 5 * 60 * 1000;

/** Inserts a synthetic PDF asset row with a controlled age. */
function seedPdfAsset(hash: string, ageMs: number, byteSize = 1000): Promise<string> {
   const record: PdfAssetRecord = {
      hash,
      blob: new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: 'application/pdf' }),
      mimeType: 'application/pdf',
      byteSize,
      createdAt: Date.now() - ageMs,
   };
   return drawerDatabase.pdfAssets.add(record);
}

/** Stores a drawer `PDF` item whose content references `assetHash`, so that hash counts as referenced. */
function referenceViaDrawerItem(itemId: string, assetHash: string): Promise<string> {
   const content: PdfDocument = { id: itemId, title: 'Rulebook', assetHash, pageCount: 42 };
   const record = {
      id: itemId,
      name: 'Rulebook',
      parentFolderId: 'root',
      order: 0,
      game: 'NEUTRAL',
      type: 'PDF',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      content,
   } as unknown as DrawerItemRecord;
   return drawerDatabase.items.add(record);
}

/** Stores a working `pdfDocs` row referencing `assetHash`, the other reference root. */
function referenceViaWorkingRow(id: string, assetHash: string): Promise<string> {
   const record: PdfRecord = {
      id,
      title: 'Open PDF',
      assetHash,
      pageCount: 42,
      updatedAt: Date.now(),
      drawerItemId: null,
      schemaVersion: 1,
   };
   return drawerDatabase.pdfDocs.add(record);
}

/** Stores a byteless PLACEHOLDER drawer `PDF` item (null hash), which references no blob. */
function placeholderDrawerItem(itemId: string): Promise<string> {
   const content: PdfDocument = { id: itemId, title: 'Awaiting file', assetHash: null, pageCount: 42 };
   const record = {
      id: itemId,
      name: 'Awaiting file',
      parentFolderId: 'root',
      order: 0,
      game: 'NEUTRAL',
      type: 'PDF',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      content,
   } as unknown as DrawerItemRecord;
   return drawerDatabase.items.add(record);
}

/** Stores a byteless PLACEHOLDER working row (null hash), the other reference root. */
function placeholderWorkingRow(id: string): Promise<string> {
   const record: PdfRecord = {
      id,
      title: 'Awaiting file',
      assetHash: null,
      pageCount: 42,
      updatedAt: Date.now(),
      drawerItemId: null,
      schemaVersion: 1,
   };
   return drawerDatabase.pdfDocs.add(record);
}

beforeEach(async () => {
   await drawerDatabase.pdfAssets.clear();
   await drawerDatabase.pdfDocs.clear();
   await drawerDatabase.items.clear();
   await drawerDatabase.meta.clear();
});

describe('runPdfSweep', () => {
   it('deletes unreferenced PDF assets older than the grace window', async () => {
      await seedPdfAsset('old-orphan', GRACE_MS + 60_000);

      const result = await runPdfSweep('manual');

      expect(result.deleted).toBe(1);
      expect(await drawerDatabase.pdfAssets.get('old-orphan')).toBeUndefined();
   });

   it('keeps unreferenced PDF assets younger than the grace window (the import race guard)', async () => {
      await seedPdfAsset('young-orphan', 1_000);

      const result = await runPdfSweep('manual');

      expect(result.deleted).toBe(0);
      expect(await drawerDatabase.pdfAssets.get('young-orphan')).toBeDefined();
   });

   it('keeps a PDF asset referenced by a drawer item regardless of age', async () => {
      await seedPdfAsset('referenced-old', GRACE_MS + 60_000);
      await referenceViaDrawerItem('item-1', 'referenced-old');

      const result = await runPdfSweep('manual');

      expect(result.deleted).toBe(0);
      expect(await drawerDatabase.pdfAssets.get('referenced-old')).toBeDefined();
   });

   it('keeps a PDF asset referenced by a working row regardless of age', async () => {
      await seedPdfAsset('referenced-open', GRACE_MS + 60_000);
      await referenceViaWorkingRow('pdf-1', 'referenced-open');

      const result = await runPdfSweep('manual');

      expect(result.deleted).toBe(0);
      expect(await drawerDatabase.pdfAssets.get('referenced-open')).toBeDefined();
   });

   it('a placeholder (null hash) contributes no reference, so an orphan asset is still reaped', async () => {
      await seedPdfAsset('old-orphan', GRACE_MS + 60_000);
      await placeholderDrawerItem('ph-item'); // null-hash drawer item
      await placeholderWorkingRow('ph-row'); // null-hash working row

      const result = await runPdfSweep('manual');

      expect(result.deleted).toBe(1); // neither placeholder protected the orphan
      expect(await drawerDatabase.pdfAssets.get('old-orphan')).toBeUndefined();
   });

   it('keeps a real PDF asset even when a placeholder also exists', async () => {
      await seedPdfAsset('referenced-old', GRACE_MS + 60_000);
      await referenceViaDrawerItem('real-item', 'referenced-old');
      await placeholderDrawerItem('ph-item'); // a coexisting placeholder must not disturb the real reference

      const result = await runPdfSweep('manual');

      expect(result.deleted).toBe(0);
      expect(await drawerDatabase.pdfAssets.get('referenced-old')).toBeDefined();
   });

   it('reports the reclaimed count and summed byteSize, ignoring protected rows', async () => {
      await seedPdfAsset('orphan-a', GRACE_MS + 60_000, 1000);
      await seedPdfAsset('orphan-b', GRACE_MS + 60_000, 2500);
      await seedPdfAsset('young', 1_000, 9999); // protected, must not be counted

      const result = await runPdfSweep('manual');

      expect(result.deleted).toBe(2);
      expect(result.reclaimedBytes).toBe(3500);
   });

   it('records pdfAssetsLastSwept bookkeeping (remaining count + reason)', async () => {
      await seedPdfAsset('old-orphan', GRACE_MS + 60_000);
      await seedPdfAsset('young', 1_000);

      await runPdfSweep('startup');

      const row = await drawerDatabase.meta.get('pdfAssetsLastSwept');
      const bookkeeping = row?.value as PdfAssetSweepRecord;
      expect(bookkeeping.assetCount).toBe(1); // one deleted, one (young) remains
      expect(bookkeeping.reason).toBe('startup');
      expect(typeof bookkeeping.at).toBe('number');
   });
});

describe('isPeriodicPdfSweepWarranted', () => {
   it('is true when the PDF asset count grew since the last sweep', async () => {
      await seedPdfAsset('young', 1_000); // unreferenced+young: survives the sweep
      await runPdfSweep('startup'); // records assetCount = 1
      await seedPdfAsset('newcomer', 500); // count is now 2 > 1

      expect(await isPeriodicPdfSweepWarranted()).toBe(true);
   });

   it('is false when nothing changed since the last sweep (no storage pressure)', async () => {
      await seedPdfAsset('young', 1_000);
      await runPdfSweep('startup'); // assetCount = 1, count still 1

      expect(await isPeriodicPdfSweepWarranted()).toBe(false);
   });
});
