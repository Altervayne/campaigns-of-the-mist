// -- Library Imports --
import { beforeEach, describe, expect, it } from 'vitest';

// -- Local Imports --
import { drawerDatabase } from '@/lib/drawer/drawerDatabase';
import * as repository from './pdfAssetRepository';

/*
 * Unit tests for the pdf asset repository against fake-indexeddb. Covers dedup-aware store,
 * blob/record get, the light hash+createdAt listing, bulk delete, byte-size sum, and clear.
 */

/** Builds a store input carrying a tiny real pdf blob and a caller-set hash. */
function makeInput(hash: string): { hash: string; blob: Blob; mimeType: string; byteSize: number } {
   const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'application/pdf' });
   return { hash, blob, mimeType: 'application/pdf', byteSize: blob.size };
}

beforeEach(async () => {
   await drawerDatabase.pdfAssets.clear();
});

describe('pdf asset repository', () => {
   it('stores a pdf and returns its hash, retrievable as a blob', async () => {
      const hash = await repository.storePdfAsset(makeInput('hash-a'));

      expect(hash).toBe('hash-a');
      const blob = await repository.getPdfBlob('hash-a');
      expect(blob).toBeInstanceOf(Blob);
      expect(blob?.type).toBe('application/pdf');
      expect(blob?.size).toBe(4);
   });

   it('getPdfBlob returns undefined for a missing hash', async () => {
      expect(await repository.getPdfBlob('nope')).toBeUndefined();
   });

   it('getPdfAsset round-trips blob + metadata', async () => {
      await repository.storePdfAsset(makeInput('hash-a'));
      const record = await repository.getPdfAsset('hash-a');

      expect(record?.hash).toBe('hash-a');
      expect(record?.mimeType).toBe('application/pdf');
      expect(record?.byteSize).toBe(4);
      expect(record?.blob).toBeInstanceOf(Blob);
      expect(typeof record?.createdAt).toBe('number');
   });

   it('is dedup-aware: a second store with an existing hash keeps one row and preserves createdAt', async () => {
      await repository.storePdfAsset(makeInput('hash-a'));
      const firstRow = await drawerDatabase.pdfAssets.get('hash-a');

      await new Promise((resolve) => setTimeout(resolve, 3)); // would-be-later timestamp
      const returned = await repository.storePdfAsset(makeInput('hash-a'));

      expect(returned).toBe('hash-a');
      expect(await drawerDatabase.pdfAssets.count()).toBe(1);
      const afterRow = await drawerDatabase.pdfAssets.get('hash-a');
      expect(afterRow?.createdAt).toBe(firstRow?.createdAt); // createdAt unchanged
   });

   it('lists hashes + createdAt (ordered, no blobs)', async () => {
      await repository.storePdfAsset(makeInput('hash-1'));
      await new Promise((resolve) => setTimeout(resolve, 3));
      await repository.storePdfAsset(makeInput('hash-2'));

      const listed = await repository.listPdfAssetHashes();

      expect(listed.map((entry) => entry.hash)).toEqual(['hash-1', 'hash-2']); // createdAt-ascending
      for (const entry of listed) {
         expect(typeof entry.createdAt).toBe('number');
         expect(entry).not.toHaveProperty('blob'); // the blobs are never loaded
         expect(Object.keys(entry).sort()).toEqual(['createdAt', 'hash']);
      }
   });

   it('bulk-deletes assets and is idempotent for absent hashes', async () => {
      await repository.storePdfAsset(makeInput('hash-1'));
      await repository.storePdfAsset(makeInput('hash-2'));
      await repository.storePdfAsset(makeInput('hash-3'));

      await repository.deletePdfAssets(['hash-1', 'hash-missing', 'hash-3']);

      expect((await repository.listPdfAssetHashes()).map((entry) => entry.hash)).toEqual(['hash-2']);
      await repository.deletePdfAssets(['hash-1']); // already gone -> no throw
   });

   it('getPdfAssetByteSizes sums the given assets', async () => {
      await repository.storePdfAsset(makeInput('hash-1'));
      await repository.storePdfAsset(makeInput('hash-2'));

      expect(await repository.getPdfAssetByteSizes(['hash-1', 'hash-2'])).toBe(8);
      expect(await repository.getPdfAssetByteSizes(['hash-1', 'hash-missing'])).toBe(4);
      expect(await repository.getPdfAssetByteSizes([])).toBe(0);
   });

   it('clearAllPdfAssets removes every asset row', async () => {
      await repository.storePdfAsset(makeInput('hash-1'));
      await repository.storePdfAsset(makeInput('hash-2'));

      await repository.clearAllPdfAssets();

      expect(await drawerDatabase.pdfAssets.count()).toBe(0);
   });
});
