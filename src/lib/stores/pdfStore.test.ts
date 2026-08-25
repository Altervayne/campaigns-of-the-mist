// -- Library Imports --
import { beforeEach, describe, expect, it } from 'vitest';

// -- Local Imports --
import { drawerDatabase } from '@/lib/drawer/drawerDatabase';
import { createPdfStore } from './pdfStore';
import { useAppGeneralStateStore } from '@/lib/stores/appGeneralStateStore';
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

describe('pdf store annotation history', () => {
   const inkAt = (id: string): PdfInk => ({ id, kind: 'ink', page: 1, color: '#e11d48', createdAt: 1, points: [0.1, 0.1], width: 0.01 });

   it('undo reverts an add and redo reapplies it', async () => {
      const useStore = await seedStore(400);
      const { beginHistory, addAnnotation, commitHistory, undo, redo } = useStore.getState().actions;

      beginHistory();
      addAnnotation(ink);
      commitHistory();
      expect(useStore.getState().doc?.annotations).toEqual({ a1: ink });
      expect(useStore.getState().undoStack).toHaveLength(1);

      undo();
      expect(useStore.getState().doc?.annotations).toEqual({});
      expect(useStore.getState().undoStack).toHaveLength(0);
      expect(useStore.getState().redoStack).toHaveLength(1);

      redo();
      expect(useStore.getState().doc?.annotations).toEqual({ a1: ink });
      expect(useStore.getState().redoStack).toHaveLength(0);
   });

   it('beginHistory takes undo focus for the pdf', async () => {
      const useStore = await seedStore(400);
      useAppGeneralStateStore.getState().actions.setLastModifiedStore('drawer');
      useStore.getState().actions.beginHistory();
      expect(useAppGeneralStateStore.getState().lastModifiedStore).toBe('pdf');
   });

   it('an eraser scrub removing several marks is one undo step', async () => {
      const useStore = await seedStore(400);
      const a1 = inkAt('a1');
      const a2 = inkAt('a2');
      useStore.setState({ doc: { ...useStore.getState().doc!, annotations: { a1, a2 } } });
      const { beginHistory, removeAnnotation, commitHistory, undo } = useStore.getState().actions;

      // A scrub brackets one begin / one commit around every contact-removal.
      beginHistory();
      removeAnnotation('a1');
      removeAnnotation('a2');
      commitHistory();
      expect(useStore.getState().undoStack).toHaveLength(1);
      expect(useStore.getState().doc?.annotations).toEqual({});

      undo();
      expect(useStore.getState().doc?.annotations).toEqual({ a1, a2 });
   });

   it('a gesture that changes nothing records no step', async () => {
      const useStore = await seedStore(400);
      const { beginHistory, commitHistory } = useStore.getState().actions;

      // A scrub over empty space (never-marked page: annotations still undefined) mutates nothing.
      beginHistory();
      commitHistory();
      expect(useStore.getState().undoStack).toHaveLength(0);
      expect(useStore.getState().redoStack).toHaveLength(0);
   });

   it('cancelHistory drops an open checkpoint so an abandoned add leaves no step', async () => {
      const useStore = await seedStore(400);
      const { beginHistory, addAnnotation, removeAnnotation, cancelHistory } = useStore.getState().actions;

      // A comment created then abandoned empty: add under an open checkpoint, then remove and cancel.
      beginHistory();
      addAnnotation(inkAt('a1'));
      removeAnnotation('a1');
      cancelHistory();
      expect(useStore.getState().undoStack).toHaveLength(0);
      expect(useStore.getState().doc?.annotations).toEqual({});
   });

   it('a checkpoint left open by begin commits on a later commitHistory', async () => {
      const useStore = await seedStore(400);
      const { beginHistory, addAnnotation, commitHistory, undo } = useStore.getState().actions;

      // A comment authored across two calls: add on create (checkpoint stays open), commit on close.
      beginHistory();
      addAnnotation(inkAt('a1'));
      commitHistory();
      expect(useStore.getState().undoStack).toHaveLength(1);

      undo();
      expect(useStore.getState().doc?.annotations).toEqual({});
   });

   it('a fresh mutation after an undo clears the redo stack', async () => {
      const useStore = await seedStore(400);
      const { beginHistory, addAnnotation, commitHistory, undo } = useStore.getState().actions;

      beginHistory();
      addAnnotation(inkAt('a1'));
      commitHistory();
      undo();
      expect(useStore.getState().redoStack).toHaveLength(1);

      beginHistory();
      addAnnotation(inkAt('a2'));
      commitHistory();
      expect(useStore.getState().redoStack).toHaveLength(0);
      expect(useStore.getState().undoStack).toHaveLength(1);
   });

   it('the undo stack caps at 50, dropping the oldest snapshot', async () => {
      const useStore = await seedStore(400);
      const { beginHistory, addAnnotation, commitHistory, undo } = useStore.getState().actions;

      // 51 committed adds push 51 snapshots; the pre-first-add (empty) snapshot falls off the bottom.
      for (let i = 1; i <= 51; i += 1) {
         beginHistory();
         addAnnotation(inkAt(`a${i}`));
         commitHistory();
      }
      expect(useStore.getState().undoStack).toHaveLength(50);

      // Undo the full stack: the earliest recoverable state is after the first add, not the empty page.
      for (let i = 0; i < 50; i += 1) undo();
      expect(Object.keys(useStore.getState().doc?.annotations ?? {})).toEqual(['a1']);
      expect(useStore.getState().undoStack).toHaveLength(0);
   });

   it('undo and redo persist through the autosave', async () => {
      const useStore = await seedStore(5);
      const { beginHistory, addAnnotation, commitHistory, undo, redo, flush } = useStore.getState().actions;

      beginHistory();
      addAnnotation(ink);
      commitHistory();
      await flush();
      expect(await rowAnnotations()).toEqual({ a1: ink });

      undo();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(await rowAnnotations()).toEqual({});

      redo();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(await rowAnnotations()).toEqual({ a1: ink });
   });
});
