// -- Library Imports --
import { beforeEach, describe, expect, it } from 'vitest';

// -- Local Imports --
import { drawerDatabase } from '@/lib/drawer/drawerDatabase';
import { PDF_SCHEMA_VERSION } from './pdfRecords';
import * as repository from './pdfRepository';

// -- Type Imports --
import type { PdfDocument } from '@/lib/types/pdf';
import type { PdfAnnotation } from '@/lib/types/pdfAnnotation';
import type { DrawerItemRecord } from '@/lib/drawer/drawerRecords';
import { DRAWER_ROOT_PARENT_ID } from '@/lib/drawer/drawerRecords';

/*
 * Unit tests for the pdf working-row repository against fake-indexeddb. Covers create
 * defaults, aggregate load, title patch (including the absent-id no-op), import round-trip,
 * annotation carry-through, the autosave-to-drawer transaction, and idempotent delete.
 */

/** A pair of annotations (one ink, one comment) for the carry-through and save assertions. */
function sampleAnnotations(): Record<string, PdfAnnotation> {
   const ink: PdfAnnotation = { id: 'a1', kind: 'ink', page: 1, color: '#e11d48', createdAt: 1, points: [0.1, 0.1, 0.2, 0.2], width: 0.01 };
   const comment: PdfAnnotation = { id: 'a2', kind: 'comment', page: 2, color: '#2563eb', createdAt: 2, rect: { x: 0.3, y: 0.3, w: 0.2, h: 0.1 }, body: 'house rule' };
   return { a1: ink, a2: comment };
}

beforeEach(async () => {
   await drawerDatabase.pdfDocs.clear();
   await drawerDatabase.items.clear();
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

      expect(doc).toEqual({ id: record.id, title: 'Rulebook', assetHash: 'hash-a', coverAssetHash: null, pageCount: 42 });
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
      const doc: PdfDocument = { id: 'pdf-1', title: 'Imported', assetHash: 'hash-b', coverAssetHash: null, pageCount: 7 };

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
      await repository.importPdf({ id: 'pdf-2', title: 'Unlinked', assetHash: 'hash-c', coverAssetHash: null, pageCount: 3 }, null);
      expect((await repository.getPdf('pdf-2'))?.drawerItemId).toBeNull();
   });

   it('deletePdf is idempotent', async () => {
      const record = await repository.createPdf({ title: 'Doomed', assetHash: 'hash-a', pageCount: 1 });

      await repository.deletePdf(record.id);
      expect(await repository.getPdf(record.id)).toBeUndefined();
      await repository.deletePdf(record.id); // already gone -> no throw
   });

   it('recordToPdfDocument copies annotations onto the aggregate', async () => {
      const annotations = sampleAnnotations();
      await repository.importPdf({ id: 'pdf-ann', title: 'Marked', assetHash: 'hash-d', coverAssetHash: null, pageCount: 5, annotations }, null);

      const doc = await repository.loadPdf('pdf-ann');
      expect(doc?.annotations).toEqual(annotations);
   });

   it('importPdf carries annotations into the working row', async () => {
      const annotations = sampleAnnotations();
      await repository.importPdf({ id: 'pdf-imp', title: 'Marked', assetHash: 'hash-e', coverAssetHash: null, pageCount: 3, annotations }, 'item-x');

      expect((await repository.getPdf('pdf-imp'))?.annotations).toEqual(annotations);
   });
});

describe('savePdfToLinkedDrawerItem', () => {
   /** Seeds a drawer `PDF` item wrapping the aggregate, mirroring the item the reader opened from. */
   async function seedDrawerItem(id: string, doc: PdfDocument): Promise<void> {
      const record: DrawerItemRecord = {
         id, name: doc.title, parentFolderId: DRAWER_ROOT_PARENT_ID, order: 0,
         game: 'NEUTRAL', type: 'PDF', createdAt: 1, updatedAt: 1, content: doc,
      };
      await drawerDatabase.items.add(record);
   }

   it('writes annotations to BOTH the row and the linked drawer item content', async () => {
      await repository.importPdf({ id: 'pdf-1', title: 'Book', assetHash: 'hash-a', coverAssetHash: null, pageCount: 4 }, 'item-1');
      await seedDrawerItem('item-1', { id: 'pdf-1', title: 'Book', assetHash: 'hash-a', coverAssetHash: null, pageCount: 4 });

      const annotations = sampleAnnotations();
      const result = await repository.savePdfToLinkedDrawerItem(
         { id: 'pdf-1', title: 'Book (annotated)', assetHash: 'hash-a', coverAssetHash: null, pageCount: 4, annotations },
         'item-1',
      );

      expect(result).toEqual({ linkedItemUpdated: true });
      expect((await repository.getPdf('pdf-1'))?.annotations).toEqual(annotations);
      const item = await drawerDatabase.items.get('item-1');
      expect((item?.content as PdfDocument).annotations).toEqual(annotations);
      expect(item?.name).toBe('Book (annotated)');
   });

   it('saves the row but reports no link when the drawer item is gone (dangling link)', async () => {
      await repository.importPdf({ id: 'pdf-2', title: 'Book', assetHash: 'hash-b', coverAssetHash: null, pageCount: 2 }, 'item-missing');

      const annotations = sampleAnnotations();
      const result = await repository.savePdfToLinkedDrawerItem(
         { id: 'pdf-2', title: 'Book', assetHash: 'hash-b', coverAssetHash: null, pageCount: 2, annotations },
         'item-missing',
      );

      expect(result).toEqual({ linkedItemUpdated: false });
      expect((await repository.getPdf('pdf-2'))?.annotations).toEqual(annotations); // the row still saved
   });

   it('does not resurrect an absent row', async () => {
      const result = await repository.savePdfToLinkedDrawerItem(
         { id: 'gone', title: 'Nope', assetHash: 'hash-c', coverAssetHash: null, pageCount: 1, annotations: sampleAnnotations() },
         null,
      );

      expect(result).toEqual({ linkedItemUpdated: false });
      expect(await repository.getPdf('gone')).toBeUndefined();
   });
});

describe('repairPdf', () => {
   /** Seeds a drawer `PDF` item wrapping the aggregate, mirroring the item the reader opened from. */
   async function seedDrawerItem(id: string, doc: PdfDocument): Promise<void> {
      const record: DrawerItemRecord = {
         id, name: doc.title, parentFolderId: DRAWER_ROOT_PARENT_ID, order: 0,
         game: 'NEUTRAL', type: 'PDF', createdAt: 1, updatedAt: 1, content: doc,
      };
      await drawerDatabase.items.add(record);
   }

   it('fills assetHash + pageCount on BOTH copies, keeping id/title/annotations/lastPage', async () => {
      const annotations = sampleAnnotations();
      const placeholder: PdfDocument = { id: 'pdf-1', title: 'Kept Title', assetHash: null, coverAssetHash: null, pageCount: 12, annotations, lastPage: 5 };
      await repository.importPdf(placeholder, 'item-1');
      await seedDrawerItem('item-1', placeholder);

      await repository.repairPdf('pdf-1', 'hash-real', 40);

      const row = await repository.getPdf('pdf-1');
      expect(row?.assetHash).toBe('hash-real');
      expect(row?.pageCount).toBe(40);
      expect(row?.title).toBe('Kept Title');
      expect(row?.annotations).toEqual(annotations);
      expect(row?.lastPage).toBe(5);

      const content = (await drawerDatabase.items.get('item-1'))?.content as PdfDocument;
      expect(content.assetHash).toBe('hash-real');
      expect(content.pageCount).toBe(40);
      expect(content.id).toBe('pdf-1');
      expect(content.title).toBe('Kept Title');
      expect(content.annotations).toEqual(annotations);
      expect(content.lastPage).toBe(5);
   });

   it('lets the supplied file win the page count over the stub', async () => {
      await repository.importPdf({ id: 'pdf-2', title: 'Stub', assetHash: null, coverAssetHash: null, pageCount: 8 }, 'item-2');
      await seedDrawerItem('item-2', { id: 'pdf-2', title: 'Stub', assetHash: null, coverAssetHash: null, pageCount: 8 });

      await repository.repairPdf('pdf-2', 'hash-real', 200);

      expect((await repository.getPdf('pdf-2'))?.pageCount).toBe(200);
      expect(((await drawerDatabase.items.get('item-2'))?.content as PdfDocument).pageCount).toBe(200);
   });

   it('fills the row even when the drawer link is dangling', async () => {
      await repository.importPdf({ id: 'pdf-3', title: 'Orphan', assetHash: null, coverAssetHash: null, pageCount: 3 }, 'item-missing');

      await repository.repairPdf('pdf-3', 'hash-real', 3);

      const row = await repository.getPdf('pdf-3');
      expect(row?.assetHash).toBe('hash-real');
   });

   it('is a no-op on an absent row', async () => {
      await repository.repairPdf('gone', 'hash-real', 4); // no throw
      expect(await repository.getPdf('gone')).toBeUndefined();
   });
});
