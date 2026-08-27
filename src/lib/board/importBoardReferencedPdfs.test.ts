// -- Library Imports --
import { beforeEach, describe, expect, it } from 'vitest';

// -- Local Imports --
import { drawerDatabase } from '@/lib/drawer/drawerDatabase';
import { createFolder, createItem, getPdfItemIdMap } from '@/lib/drawer/drawerRepository';
import { collectBoardReferencedPdfs } from './collectBoardReferencedPdfs';
import { rehydrateBoardReferencedPdfs } from './importBoardReferencedPdfs';
import { prepareImportedBoard } from './importBoardReferencedCharacters';

// -- Type Imports --
import type { Board, BoardItem, PortalBoardContent } from '@/lib/types/board';
import type { PdfDocument } from '@/lib/types/pdf';
import type { PdfAnnotation } from '@/lib/types/pdfAnnotation';

/*
 * Tests for the board PDF-portal round trip: a board export embeds a byteless STUB of every pdf its portals
 * point at, and the importer materializes each as a placeholder drawer item whose preserved id keeps the
 * portal resolving. No rewire follows - the portal names the pdf by id, which reIdBoardAggregate preserves.
 * Dexie on fake-indexeddb.
 */

const FOLDER = 'Imported from My Board';
const ink: PdfAnnotation = { id: 'a1', kind: 'ink', page: 1, color: '#e11d48', createdAt: 1, points: [0.1, 0.1], width: 0.01 };

function makeEnsureFolder(name = FOLDER): () => Promise<string> {
   let id: string | null = null;
   return async () => {
      if (id === null) id = (await createFolder({ name, parentFolderId: null })).id;
      return id;
   };
}

function pdfDoc(id: string, assetHash: string | null = 'hash-real'): PdfDocument {
   return { id, title: `Book ${id}`, assetHash, coverAssetHash: null, pageCount: 42, annotations: { a1: ink } };
}

/** A portal board item pointing at a pdf by id. */
function pdfPortalItem(id: string, pdfId: string): BoardItem {
   const content: PortalBoardContent = {
      kind: 'portal',
      target: { kind: 'entity', entity: 'pdf', id: pdfId },
      style: { visual: { kind: 'icon', icon: 'FileText' }, label: '', align: 'bottom', background: true },
   };
   return { id, kind: 'portal', x: 0, y: 0, width: 120, height: 120, z: 0, content };
}

function board(items: BoardItem[]): Board {
   return { id: 'b', name: 'My Board', viewport: { x: 0, y: 0, zoom: 1 }, nextLayerSeq: 1, items };
}

/** Seeds a saved local drawer PDF so a portal-target lookup finds it. Returns its drawer item id. */
async function seedLocalPdf(doc: PdfDocument): Promise<string> {
   const record = await createItem({ name: doc.title, game: 'NEUTRAL', type: 'PDF', content: doc, parentFolderId: null });
   return record.id;
}

beforeEach(async () => {
   await drawerDatabase.items.clear();
   await drawerDatabase.folders.clear();
   await drawerDatabase.pdfAssets.clear();
});

describe('collectBoardReferencedPdfs', () => {
   it('embeds a byteless stub of the pdf a portal targets, keeping id + title + pages + annotations', async () => {
      await seedLocalPdf(pdfDoc('pdf-1'));

      const collected = await collectBoardReferencedPdfs(board([pdfPortalItem('p1', 'pdf-1')]));

      const stub = collected['pdf-1'];
      expect(stub).toBeDefined();
      expect(stub.assetHash).toBeNull();
      expect(stub.id).toBe('pdf-1');
      expect(stub.title).toBe('Book pdf-1');
      expect(stub.pageCount).toBe(42);
      expect(stub.annotations).toEqual({ a1: ink });
   });

   it('de-dupes by pdf id across several portals and skips an unresolvable target', async () => {
      await seedLocalPdf(pdfDoc('pdf-1'));

      const collected = await collectBoardReferencedPdfs(
         board([pdfPortalItem('p1', 'pdf-1'), pdfPortalItem('p2', 'pdf-1'), pdfPortalItem('p3', 'pdf-missing')]),
      );

      expect(Object.keys(collected)).toEqual(['pdf-1']); // one entry, missing target skipped
   });
});

describe('rehydrateBoardReferencedPdfs', () => {
   it('materializes an absent pdf as a placeholder keeping its id, under the Imported-from folder', async () => {
      await rehydrateBoardReferencedPdfs({ 'pdf-1': pdfDoc('pdf-1', null) }, makeEnsureFolder());

      const drawerItemId = (await getPdfItemIdMap()).get('pdf-1');
      expect(drawerItemId).toBeDefined();
      const record = await drawerDatabase.items.get(drawerItemId!);
      expect(record?.type).toBe('PDF');
      const content = record?.content as PdfDocument;
      expect(content.id).toBe('pdf-1');
      expect(content.assetHash).toBeNull();
      expect(content.annotations).toEqual({ a1: ink });
      // Materialized placeholder owns no bytes.
      expect(await drawerDatabase.pdfAssets.count()).toBe(0);
   });

   it('links (never overwrites) a pdf already in the drawer and creates no folder', async () => {
      await seedLocalPdf(pdfDoc('pdf-have', 'hash-real'));

      await rehydrateBoardReferencedPdfs({ 'pdf-have': pdfDoc('pdf-have', null) }, makeEnsureFolder());

      // The existing item is untouched (its real hash survives), and no landing folder was made.
      const drawerItemId = (await getPdfItemIdMap()).get('pdf-have')!;
      expect((await drawerDatabase.items.get(drawerItemId))?.content).toMatchObject({ assetHash: 'hash-real' });
      expect(await drawerDatabase.folders.count()).toBe(0);
   });

   it('is a no-op for an absent embed map', async () => {
      await rehydrateBoardReferencedPdfs(undefined, makeEnsureFolder());
      expect(await drawerDatabase.items.count()).toBe(0);
   });
});

describe('prepareImportedBoard (pdf portals, end to end)', () => {
   it('materializes a placeholder for the portal target and preserves the portal id', async () => {
      const input = board([pdfPortalItem('p1', 'pdf-1')]);

      const prepared = await prepareImportedBoard(input, { pdfs: { 'pdf-1': pdfDoc('pdf-1', null) } }, FOLDER);

      // The portal's target id is preserved (reIdBoardAggregate never touches an entity target), so it resolves
      // to the freshly materialized placeholder.
      const portal = prepared.items.find((item) => item.content.kind === 'portal')!;
      expect(portal.content.kind === 'portal' && portal.content.target.kind === 'entity' && portal.content.target.id).toBe('pdf-1');

      const drawerItemId = (await getPdfItemIdMap()).get('pdf-1');
      expect(drawerItemId).toBeDefined();
      expect((await drawerDatabase.items.get(drawerItemId!))?.content).toMatchObject({ id: 'pdf-1', assetHash: null });
   });
});
