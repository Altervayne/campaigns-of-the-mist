// -- Library Imports --
import { beforeEach, describe, expect, it } from 'vitest';

// -- Local Imports --
import { drawerDatabase } from '@/lib/drawer/drawerDatabase';
import { createPdfStore } from './pdfStore';
import * as repository from '@/lib/pdf/pdfRepository';
import { DRAWER_ROOT_PARENT_ID } from '@/lib/drawer/drawerRecords';

// -- Type Imports --
import type { PdfDocument } from '@/lib/types/pdf';
import type { PdfAnnotation, PdfInk } from '@/lib/types/pdfAnnotation';
import type { DrawerItemRecord } from '@/lib/drawer/drawerRecords';

/*
 * Unit tests for the pdf store's writable annotation surface: add/update/remove mutate the live
 * doc, the debounced autosave writes through to both the row and the linked drawer copy, and
 * `flush` disarms the pending timer while landing the write exactly once. Bytes/pdf.js are never
 * loaded here - the doc is seeded directly, so no worker transport spins up.
 */

const ink: PdfInk = { id: 'a1', kind: 'ink', page: 1, color: '#e11d48', createdAt: 1, points: [0.1, 0.1], width: 0.01 };

/** Imports a working row + a linked drawer item, then seeds a store instance's live doc without touching pdf.js. */
async function seedStore(saveDebounceMs: number) {
   const doc: PdfDocument = { id: 'pdf-1', title: 'Book', assetHash: 'hash-a', pageCount: 4 };
   await repository.importPdf(doc, 'item-1');
   const item: DrawerItemRecord = {
      id: 'item-1', name: 'Book', parentFolderId: DRAWER_ROOT_PARENT_ID, order: 0,
      game: 'NEUTRAL', type: 'PDF', createdAt: 1, updatedAt: 1, content: doc,
   };
   await drawerDatabase.items.add(item);

   const useStore = createPdfStore({ saveDebounceMs });
   useStore.setState({ pdfId: 'pdf-1', doc, drawerItemId: 'item-1', status: 'ready' });
   return useStore;
}

/** Reads the annotations currently persisted on the working row. */
async function rowAnnotations(): Promise<Record<string, PdfAnnotation> | undefined> {
   return (await repository.getPdf('pdf-1'))?.annotations;
}

beforeEach(async () => {
   await drawerDatabase.pdfDocs.clear();
   await drawerDatabase.items.clear();
});

describe('pdf store annotations', () => {
   it('addAnnotation puts the annotation on the live doc', async () => {
      const useStore = await seedStore(400);
      useStore.getState().actions.addAnnotation(ink);
      expect(useStore.getState().doc?.annotations).toEqual({ a1: ink });
   });

   it('updateAnnotation merges a patch, keeping the discriminant and id', async () => {
      const useStore = await seedStore(400);
      useStore.getState().actions.addAnnotation(ink);
      useStore.getState().actions.updateAnnotation('a1', { color: '#2563eb', width: 0.02 });

      const updated = useStore.getState().doc?.annotations?.a1 as PdfInk;
      expect(updated).toEqual({ ...ink, color: '#2563eb', width: 0.02 });
      expect(updated.kind).toBe('ink');
   });

   it('updateAnnotation is a no-op on an absent id', async () => {
      const useStore = await seedStore(400);
      useStore.getState().actions.updateAnnotation('missing', { color: '#000000' });
      expect(useStore.getState().doc?.annotations ?? {}).toEqual({});
   });

   it('removeAnnotation drops the key', async () => {
      const useStore = await seedStore(400);
      useStore.getState().actions.addAnnotation(ink);
      useStore.getState().actions.removeAnnotation('a1');
      expect(useStore.getState().doc?.annotations).toEqual({});
   });

   it('flush writes through to the row and the linked drawer item, then resolves', async () => {
      const useStore = await seedStore(400);
      useStore.getState().actions.addAnnotation(ink);

      await useStore.getState().actions.flush();

      expect(await rowAnnotations()).toEqual({ a1: ink });
      const item = await drawerDatabase.items.get('item-1');
      expect((item?.content as PdfDocument).annotations).toEqual({ a1: ink });
   });

   it('a rapid add then flush lands exactly once and disarms the pending timer', async () => {
      const useStore = await seedStore(5);
      useStore.getState().actions.addAnnotation(ink);
      await useStore.getState().actions.flush();

      expect(await rowAnnotations()).toEqual({ a1: ink });

      // Mutate the row underneath, then let the (disarmed) debounce window elapse: a late timer would
      // clobber this back to the flushed snapshot.
      await repository.patchPdf('pdf-1', { annotations: { a1: ink, a2: ink } as Record<string, PdfAnnotation> });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(Object.keys((await rowAnnotations()) ?? {})).toEqual(['a1', 'a2']);
   });

   it('flush resolves without writing when no doc is loaded', async () => {
      const useStore = createPdfStore({ saveDebounceMs: 5 });
      await expect(useStore.getState().actions.flush()).resolves.toBeUndefined();
   });
});
