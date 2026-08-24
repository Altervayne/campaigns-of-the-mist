// -- Library Imports --
import { beforeEach, describe, expect, it } from 'vitest';

// -- Local Imports --
import { drawerDatabase } from '@/lib/drawer/drawerDatabase';
import { PDF_SCHEMA_VERSION } from './pdfRecords';
import * as repository from './pdfRepository';

// -- Type Imports --
import type { PdfDocument } from '@/lib/types/pdf';

/*
 * Unit tests for the pdf working-row repository against fake-indexeddb. Covers create
 * defaults, aggregate load, title patch (including the absent-id no-op), import round-trip,
 * and idempotent delete.
 */

beforeEach(async () => {
   await drawerDatabase.pdfDocs.clear();
});

describe('pdf repository', () => {
   it('createPdf mints a row with the right defaults', async () => {
      const record = await repository.createPdf({ title: 'Rulebook', assetHash: 'hash-a', pageCount: 42 });

      expect(record.id).toBeTruthy();
      expect(record.title).toBe('Rulebook');
      expect(record.assetHash).toBe('hash-a');
      expect(record.pageCount).toBe(42);
      expect(record.drawerItemId).toBeNull();
      expect(record.schemaVersion).toBe(PDF_SCHEMA_VERSION);
      expect(typeof record.updatedAt).toBe('number');
   });

   it('loadPdf assembles the aggregate (persistence-only fields dropped)', async () => {
      const record = await repository.createPdf({ title: 'Rulebook', assetHash: 'hash-a', pageCount: 42 });

      const doc = await repository.loadPdf(record.id);

      expect(doc).toEqual({ id: record.id, title: 'Rulebook', assetHash: 'hash-a', pageCount: 42 });
      expect(await repository.loadPdf('missing')).toBeUndefined();
   });

   it('patchPdf updates the title and refreshes updatedAt', async () => {
      const record = await repository.createPdf({ title: 'Old', assetHash: 'hash-a', pageCount: 1 });

      await new Promise((resolve) => setTimeout(resolve, 3));
      await repository.patchPdf(record.id, { title: 'New' });

      const after = await repository.getPdf(record.id);
      expect(after?.title).toBe('New');
      expect(after?.updatedAt).toBeGreaterThan(record.updatedAt);
   });

   it('patchPdf is a no-op on an absent id', async () => {
      await repository.patchPdf('missing', { title: 'New' }); // no throw
      expect(await repository.getPdf('missing')).toBeUndefined();
   });

   it('importPdf materializes an aggregate into the working table', async () => {
      const doc: PdfDocument = { id: 'pdf-1', title: 'Imported', assetHash: 'hash-b', pageCount: 7 };

      await repository.importPdf(doc, 'item-1');

      const record = await repository.getPdf('pdf-1');
      expect(record?.title).toBe('Imported');
      expect(record?.assetHash).toBe('hash-b');
      expect(record?.pageCount).toBe(7);
      expect(record?.drawerItemId).toBe('item-1');
      expect(record?.schemaVersion).toBe(PDF_SCHEMA_VERSION);
      expect(await repository.loadPdf('pdf-1')).toEqual(doc);
   });

   it('importPdf defaults a missing drawer link to null', async () => {
      await repository.importPdf({ id: 'pdf-2', title: 'Unlinked', assetHash: 'hash-c', pageCount: 3 }, null);
      expect((await repository.getPdf('pdf-2'))?.drawerItemId).toBeNull();
   });

   it('deletePdf is idempotent', async () => {
      const record = await repository.createPdf({ title: 'Doomed', assetHash: 'hash-a', pageCount: 1 });

      await repository.deletePdf(record.id);
      expect(await repository.getPdf(record.id)).toBeUndefined();
      await repository.deletePdf(record.id); // already gone -> no throw
   });
});
